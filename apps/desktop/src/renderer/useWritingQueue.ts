import { useEffect, useRef, useState } from 'react';
import { runAutomaticWriting } from './automatic-writing.js';
import { createRetryJob, getSavedHistoryInput, MAX_WRITING_JOBS, readWritingQueue, saveWritingQueue, validateWritingConfig, type WritingConfig, type WritingConfirmation, type WritingJob } from './writing-queue.js';

export function useWritingQueue(userId: string, checkConfig: (config: WritingConfig) => void) {
  const [jobs, setJobs] = useState<readonly WritingJob[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [confirmation, setConfirmation] = useState<WritingConfirmation | null>(null);
  const jobsRef = useRef<readonly WritingJob[]>([]);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const historyRetry = useRef(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);

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
    if (!ready || controller.current || historyRetry.current) return null;
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
  const remove = (id: string): boolean => {
    if (!ready || controller.current || historyRetry.current) return false;
    try {
      const next = jobsRef.current.filter((job) => job.id !== id);
      saveWritingQueue(localStorage, userId, next);
      jobsRef.current = next;
      setJobs(next);
      setError(null);
      return true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : '목록을 수정하지 못했습니다.'); return false; }
  };
  const start = (onlyId?: string): void => {
    if (!ready || controller.current || historyRetry.current) return;
    const pending = jobsRef.current.filter((job) => job.status === 'queued' && (!onlyId || job.id === onlyId));
    if (!pending.length) return;
    try {
      for (const job of pending) { validateWritingConfig(job.config, userId); checkConfig(job.config); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : '설정을 다시 확인해 주세요.'); return; }
    setError(null);
    setConfirmation({ jobs: pending });
  };
  const retry = (id: string): void => {
    if (!ready || controller.current || historyRetry.current || confirmation) return;
    try {
      const source = jobsRef.current.find((job) => job.id === id);
      if (!source) throw new Error('재생성할 글을 찾지 못했습니다.');
      if (jobsRef.current.length >= MAX_WRITING_JOBS) throw new Error('작성 목록이 가득 찼습니다. 다른 완료 항목을 정리한 뒤 재생성해 주세요. 기존 실패 내용은 보존합니다.');
      const job = createRetryJob(source, userId);
      checkConfig(job.config);
      setError(null);
      setConfirmation({ jobs: [job], retry: source });
    } catch (failure) { setError(failure instanceof Error ? failure.message : '재생성을 준비하지 못했습니다.'); }
  };
  const retryHistory = async (id: string): Promise<void> => {
    if (!ready || controller.current || historyRetry.current) return;
    const job = jobsRef.current.find(item => item.id === id);
    if (!job || job.status !== 'saved' || !job.historyPending) return;
    historyRetry.current = true;
    setRecordingId(id);
    setError(null);
    try {
      const response = await window.blowWorkHistory.add(userId, getSavedHistoryInput(job));
      if (!response.ok) throw new Error(response.error.message);
      update({ ...job, historyPending: false, message: '네이버 임시저장 완료 · 작업 내역 기록 완료. 글 재생성이나 네이버 재저장은 하지 않았습니다.' });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '작업 내역을 기록하지 못했습니다.');
    } finally { historyRetry.current = false; setRecordingId(null); }
  };
  const confirmStart = async (onStarted: () => void): Promise<void> => {
    if (!ready || controller.current || historyRetry.current || !confirmation) return;
    const pending = confirmation.jobs;
    const source = confirmation.retry;
    setConfirmation(null);
    try {
      if (source ? !jobsRef.current.includes(source) || !['failed', 'interrupted'].includes(source.status)
        : pending.some((job) => !jobsRef.current.includes(job) || job.status !== 'queued')) throw new Error('작성 목록이 변경되었습니다. 실행할 글을 다시 확인해 주세요.');
      for (const job of pending) { validateWritingConfig(job.config, userId); checkConfig(job.config); }
      if (source) {
        // Only add a retry after explicit cost/duplicate-save confirmation. Keep the failed original intact.
        const next = [...jobsRef.current, ...pending];
        saveWritingQueue(localStorage, userId, next);
        jobsRef.current = next;
        setJobs(next);
      }
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
          try { update({ ...current, status: current.status === 'saved' ? 'saved' : run.signal.aborted ? 'interrupted' : 'failed', message: current.status === 'saved' ? current.message + ' ' + message : `중단 단계: ${current.message} ${message}` }); }
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
  return { jobs, ready, error, busy, stopping, confirmation, recordingId, retryHistory, add, remove, start, retry, confirmStart, cancelStart: () => setConfirmation(null), stop };
}
