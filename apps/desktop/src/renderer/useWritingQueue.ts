import { useEffect, useRef, useState } from 'react';
import { runAutomaticWriting } from './automatic-writing.js';
import { readWritingQueue, saveWritingQueue, validateWritingConfig, type WritingConfig, type WritingJob } from './writing-queue.js';

export function useWritingQueue(userId: string, checkConfig: (config: WritingConfig) => void) {
  const [jobs, setJobs] = useState<readonly WritingJob[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [confirmation, setConfirmation] = useState<readonly WritingJob[] | null>(null);
  const jobsRef = useRef<readonly WritingJob[]>([]);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    try {
      const loaded = readWritingQueue(localStorage, userId);
      jobsRef.current = loaded;
      setJobs(loaded);
      setReady(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '작성 목록을 불러오지 못했습니다.'); }
    return () => {
      mounted.current = false;
      if (controller.current) {
        controller.current.abort();
        void window.blowOpenAi.cancelGeneration().catch(() => undefined);
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const commit = (next: readonly WritingJob[]): void => {
    // Update memory first so a confirmed Naver save is never mislabeled or retried after a disk error.
    jobsRef.current = next;
    if (mounted.current) setJobs(next);
    saveWritingQueue(localStorage, userId, next);
  };
  const update = (job: WritingJob): void => commit(jobsRef.current.map((item) => item.id === job.id ? job : item));
  const add = (config: WritingConfig, editingId?: string): string | null => {
    if (!ready || controller.current) return null;
    try {
      validateWritingConfig(config, userId);
      checkConfig(config);
      if (editingId && !jobsRef.current.some((job) => job.id === editingId && job.status === 'queued')) throw new Error('대기 중인 글만 수정할 수 있습니다.');
      const job: WritingJob = { id: editingId ?? crypto.randomUUID(), config: structuredClone(config), status: 'queued', message: '설정 완료 · 실행 대기' };
      // Validate storage before displaying a newly added job.
      const next = editingId ? jobsRef.current.map((item) => item.id === editingId ? job : item) : [...jobsRef.current, job];
      saveWritingQueue(localStorage, userId, next);
      jobsRef.current = next;
      setJobs(next);
      setError(null);
      return job.id;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '설정을 저장하지 못했습니다.'); return null; }
  };
  const remove = (id: string): void => {
    if (!ready || controller.current) return;
    try {
      const next = jobsRef.current.filter((job) => job.id !== id);
      saveWritingQueue(localStorage, userId, next);
      jobsRef.current = next;
      setJobs(next);
      setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '목록을 수정하지 못했습니다.'); }
  };
  const start = (onlyId?: string): void => {
    if (!ready || controller.current) return;
    const pending = jobsRef.current.filter((job) => job.status === 'queued' && (!onlyId || job.id === onlyId));
    if (!pending.length) return;
    try {
      for (const job of pending) { validateWritingConfig(job.config, userId); checkConfig(job.config); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '설정을 다시 확인해 주세요.'); return; }
    setError(null);
    setConfirmation(pending);
  };
  const confirmStart = async (onStarted: () => void): Promise<void> => {
    if (!ready || controller.current || !confirmation) return;
    const pending = confirmation;
    setConfirmation(null);
    try {
      if (pending.some((job) => !jobsRef.current.includes(job) || job.status !== 'queued')) throw new Error('작성 목록이 변경되었습니다. 실행할 글을 다시 확인해 주세요.');
      for (const job of pending) { validateWritingConfig(job.config, userId); checkConfig(job.config); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '설정을 다시 확인해 주세요.'); return; }
    const run = new AbortController();
    controller.current = run;
    setBusy(true);
    setStopping(false);
    setError(null);
    try {
      onStarted();
      for (const job of pending) {
        if (run.signal.aborted) break;
        try {
          checkConfig(job.config);
          await runAutomaticWriting(job, window, run.signal, update);
        } catch (failure) {
          const message = failure instanceof Error ? failure.message : '실행 결과를 확인하지 못했습니다.';
          const current = jobsRef.current.find((item) => item.id === job.id) ?? job;
          try { update({ ...current, status: current.status === 'saved' ? 'saved' : run.signal.aborted ? 'interrupted' : 'failed', message: current.status === 'saved' ? current.message + ' ' + message : message }); }
          catch { /* The in-memory result is retained. The disk checkpoint recovers as interrupted. */ }
          if (mounted.current) setError(message + ' 다음 글은 실행하지 않았습니다.');
          break;
        }
      }
    } finally {
      controller.current = null;
      if (mounted.current) { setBusy(false); setStopping(false); }
    }
  };
  const stop = (): void => {
    if (!controller.current) return;
    controller.current.abort();
    setStopping(true);
    void window.blowOpenAi.cancelGeneration().catch(() => {
      if (mounted.current) setError('생성 중단 응답을 받지 못했습니다. 현재 요청이 끝나면 다음 단계는 실행하지 않습니다.');
    });
  };
  return { jobs, ready, error, busy, stopping, confirmation, add, remove, start, confirmStart, cancelStart: () => setConfirmation(null), stop };
}
