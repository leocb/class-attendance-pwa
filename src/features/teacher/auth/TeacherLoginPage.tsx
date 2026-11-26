import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, UserPlus } from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import { TurnstileWidget } from '../../../components/TurnstileWidget';
import { CONFIG } from '../../../lib/config';
import { errorMessage } from '../../../lib/errors';
import {
  isPasskeySupported,
  registerTeacherWithPasskey,
  signInTeacherWithPasskey,
} from '../../../lib/firebase/auth';
import { useI18n } from '../../../lib/i18n';

export function TeacherLoginPage() {
  const { isTeacher, isOnline } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState<'login' | 'register' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [loginReset, setLoginReset] = useState(0);
  const [regToken, setRegToken] = useState<string | null>(null);
  const [regReset, setRegReset] = useState(0);

  useEffect(() => {
    if (isTeacher) {
      navigate('/teacher/classes', { replace: true });
    }
  }, [isTeacher, navigate]);

  const supported = isPasskeySupported();
  const turnstileEnabled = Boolean(CONFIG.TURNSTILE_SITE_KEY);

  const handleLogin = async () => {
    setError(null);
    if (turnstileEnabled && !loginToken) {
      setError(t('errTurnstileRequired'));
      return;
    }
    setBusy('login');
    try {
      await signInTeacherWithPasskey(loginToken ?? undefined);
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t, 'errPasskeyLoginFailed'));
    } finally {
      setBusy(null);
      setLoginReset((n) => n + 1);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (turnstileEnabled && !regToken) {
      setError(t('errTurnstileRequired'));
      return;
    }
    setBusy('register');
    try {
      await registerTeacherWithPasskey(displayName, regToken ?? undefined);
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t, 'errPasskeyRegisterFailed'));
    } finally {
      setBusy(null);
      setRegReset((n) => n + 1);
    }
  };

  return (
    <div className="stack-lg">
      <div className="card stack-md">
        <div className="row">
          <Fingerprint size={28} />
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
            {t('teacherPasskeySignIn')}
          </h1>
        </div>

        {!supported && (
          <div className="alert alert-danger">{t('passkeyUnsupported')}</div>
        )}

        {!isOnline && (
          <div className="alert alert-warning">{t('passkeyOffline')}</div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {isOnline && (
          <TurnstileWidget
            action="teacher_login"
            onToken={setLoginToken}
            resetTrigger={loginReset}
          />
        )}

        <button
          type="button"
          className="btn btn-primary"
          disabled={
            !supported ||
            !isOnline ||
            busy !== null ||
            (turnstileEnabled && !loginToken)
          }
          onClick={handleLogin}
        >
          <KeyRound size={18} />
          {busy === 'login' ? t('waitingPasskey') : t('signInPasskey')}
        </button>
      </div>

      <div className="card stack-md">
        <div className="row">
          <UserPlus size={22} />
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
            {t('createTeacherAccount')}
          </h2>
        </div>

        <form onSubmit={handleRegister} className="stack-md">
          <div>
            <label className="label" htmlFor="teacher-name">
              {t('teacherDisplayNameLabel')}
            </label>
            <input
              id="teacher-name"
              className="input"
              placeholder={t('teacherDisplayNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {isOnline && (
            <TurnstileWidget
              action="teacher_register"
              onToken={setRegToken}
              resetTrigger={regReset}
            />
          )}

          <button
            type="submit"
            className="btn"
            disabled={
              !supported ||
              !isOnline ||
              busy !== null ||
              (turnstileEnabled && !regToken)
            }
          >
            <Fingerprint size={18} />
            {busy === 'register'
              ? t('creatingPasskey')
              : t('createAccountPasskey')}
          </button>
        </form>
      </div>
    </div>
  );
}
