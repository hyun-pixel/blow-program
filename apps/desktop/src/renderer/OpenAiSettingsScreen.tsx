import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

type CredentialState = 'loading' | 'saved' | 'missing' | 'error';
type ConnectionState = 'pending' | 'checking' | 'connected' | 'failed';

interface Notice {
  readonly title: string;
  readonly detail: string;
}

export function OpenAiSettingsScreen() {
  const [credentialState, setCredentialState] = useState<CredentialState>('loading');
  const [apiKey, setApiKey] = useState('');
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('pending');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void window.blowOpenAi.getStatus().then((response) => {
      if (!active) return;

      if (response.ok) {
        setCredentialState(response.status.saved ? 'saved' : 'missing');
      } else {
        setCredentialState('error');
        setErrorMessage(response.error.message);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const saveCredential = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    setErrorMessage(null);

    const response = await window.blowOpenAi.save(apiKey);
    setApiKey('');
    setIsKeyVisible(false);

    if (response.ok) {
      setCredentialState('saved');
      setConnectionState('pending');
      setNotice({
        title: '보안 저장 완료',
        detail: 'OpenAI API 키를 Windows 보안 저장소에 암호화해 저장했습니다.',
      });
    } else {
      setCredentialState('error');
      setErrorMessage(response.error.message);
    }

    setIsSaving(false);
  };

  const removeCredential = async (): Promise<void> => {
    if (!window.confirm('이 PC에 저장된 OpenAI API 키를 삭제할까요?')) return;

    setIsSaving(true);
    setNotice(null);
    setErrorMessage(null);

    const response = await window.blowOpenAi.remove();

    if (response.ok) {
      setCredentialState('missing');
      setConnectionState('pending');
      setNotice({
        title: '저장된 키 삭제 완료',
        detail: '이 PC에 저장된 OpenAI API 키를 삭제했습니다.',
      });
    } else {
      setCredentialState('error');
      setErrorMessage(response.error.message);
    }

    setIsSaving(false);
  };

  const testConnection = async (): Promise<void> => {
    setConnectionState('checking');
    setNotice(null);
    setErrorMessage(null);

    const response = await window.blowOpenAi.testConnection();

    if (response.ok) {
      setConnectionState('connected');
      setNotice({
        title: 'OpenAI 연결 확인 완료',
        detail: '저장된 API 키의 인증과 모델 조회 권한을 확인했습니다.',
      });
    } else {
      setConnectionState('failed');
      setErrorMessage(response.error.message);
    }
  };

  const hasSavedCredential = credentialState === 'saved';
  const isBusy = isSaving || connectionState === 'checking';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>OpenAI 연결</h1>
          <p>개인 API 키를 이 Windows 계정에서만 열 수 있도록 암호화해 보관합니다.</p>
        </div>
      </header>

      {errorMessage ? (
        <div className="message error-message" role="alert">
          <XCircle aria-hidden="true" />
          <div>
            <h2>API 키 작업을 완료하지 못했습니다</h2>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="message success-message" role="status">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>{notice.title}</h2>
            <p>{notice.detail}</p>
          </div>
        </div>
      ) : null}

      <section className="connection-workbench" aria-labelledby="openai-key-heading">
        <div className="connection-form-panel">
          <header className="panel-heading compact">
            <div>
              <h2 id="openai-key-heading">API 키 보관</h2>
              <p>저장된 키 원문은 화면에 다시 표시하지 않습니다.</p>
            </div>
          </header>

          <form className="connection-form" onSubmit={(event) => void saveCredential(event)}>
            <div className="field-group">
              <label htmlFor="openai-api-key">
                {hasSavedCredential ? '새 OpenAI API 키' : 'OpenAI API 키'}
                <span>필수</span>
              </label>
              <div className="credential-input-row">
                <input
                  id="openai-api-key"
                  type={isKeyVisible ? 'text' : 'password'}
                  value={apiKey}
                  minLength={20}
                  maxLength={512}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isBusy}
                  required
                  aria-describedby="openai-api-key-help"
                  onChange={(event) => setApiKey(event.target.value)}
                />
                <button
                  className="button secondary"
                  type="button"
                  disabled={isBusy}
                  aria-pressed={isKeyVisible}
                  onClick={() => setIsKeyVisible((visible) => !visible)}
                >
                  {isKeyVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {isKeyVisible ? '숨기기' : '표시'}
                </button>
              </div>
              <p id="openai-api-key-help" className="field-help">
                붙여넣은 키는 BLOW 서버로 전송되지 않으며 이 PC에 암호화된 형태로만 저장됩니다.
              </p>
            </div>

            <div className="connection-note">
              <ShieldCheck aria-hidden="true" />
              <p>OpenAI API 사용료는 BLOW 이용료와 별도로 본인의 OpenAI 계정에 청구될 수 있습니다.</p>
            </div>

            <div className="credential-actions">
              <button className="button primary connection-primary" type="submit" disabled={isBusy}>
                {isSaving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                {isSaving ? '저장 중…' : hasSavedCredential ? '새 키로 교체' : '키 안전하게 저장'}
              </button>
              {hasSavedCredential ? (
                <>
                  <button className="button secondary" type="button" disabled={isBusy} onClick={() => void testConnection()}>
                    {connectionState === 'checking' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                    {connectionState === 'checking' ? '확인 중…' : '연결 검사'}
                  </button>
                  <button className="button danger" type="button" disabled={isBusy} onClick={() => void removeCredential()}>
                    <Trash2 aria-hidden="true" />
                    저장된 키 삭제
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </div>

        <aside className="connection-progress" aria-label="OpenAI 연결 준비 상태">
          <header className="panel-heading compact">
            <div>
              <h2>보안 상태</h2>
              <p>키 원문을 노출하지 않고 상태만 표시합니다.</p>
            </div>
          </header>

          <div className="live-status" role="status">
            {credentialState === 'loading' ? (
              <LoaderCircle className="is-spinning" aria-hidden="true" />
            ) : hasSavedCredential ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <Circle aria-hidden="true" />
            )}
            <div>
              <strong>
                {credentialState === 'loading'
                  ? '보관 상태 확인 중'
                  : hasSavedCredential
                    ? 'API 키 저장됨'
                    : 'API 키 필요'}
              </strong>
              <small>{hasSavedCredential ? '키 교체 또는 삭제가 가능합니다.' : '개인 API 키를 입력해 주세요.'}</small>
            </div>
          </div>

          <ol className="step-list">
            <li className="step-row is-complete">
              <span className="step-icon"><CheckCircle2 aria-hidden="true" /></span>
              <span className="step-copy"><strong>Windows 보안 저장소</strong><small>현재 Windows 계정으로 암호화합니다.</small></span>
              <span className="step-state">적용</span>
            </li>
            <li className="step-row is-complete">
              <span className="step-icon"><CheckCircle2 aria-hidden="true" /></span>
              <span className="step-copy"><strong>BLOW 서버 미전송</strong><small>키와 작성 내용은 서버에 저장하지 않습니다.</small></span>
              <span className="step-state">적용</span>
            </li>
            <li className={`step-row ${connectionState === 'connected' ? 'is-complete' : connectionState === 'failed' ? 'is-failed' : 'is-current'}`}>
              <span className="step-icon">
                {connectionState === 'checking' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : connectionState === 'connected' ? <CheckCircle2 aria-hidden="true" /> : connectionState === 'failed' ? <XCircle aria-hidden="true" /> : <Circle aria-hidden="true" />}
              </span>
              <span className="step-copy">
                <strong>OpenAI 연결 검사</strong>
                <small>{connectionState === 'connected' ? '저장된 키의 인증과 모델 조회 권한을 확인했습니다.' : connectionState === 'checking' ? 'OpenAI에서 키의 유효성을 확인하고 있습니다.' : '모델 목록만 조회하며 콘텐츠는 생성하지 않습니다.'}</small>
              </span>
              <span className="step-state">{connectionState === 'connected' ? '확인됨' : connectionState === 'checking' ? '확인 중' : connectionState === 'failed' ? '재확인' : hasSavedCredential ? '확인 필요' : '키 필요'}</span>
            </li>
          </ol>
        </aside>
      </section>
    </>
  );
}
