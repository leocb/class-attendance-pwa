import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
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

  // A single Turnstile challenge guards both sign-in and account creation.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (isTeacher) {
      navigate('/teacher/classes', { replace: true });
    }
  }, [isTeacher, navigate]);

  const supported = isPasskeySupported();
  const turnstileEnabled = Boolean(CONFIG.TURNSTILE_SITE_KEY) && isOnline;
  const gateOpen = !turnstileEnabled || Boolean(turnstileToken);

  const handleLogin = async () => {
    setError(null);
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileToken(null);
      return;
    }
    setBusy('login');
    try {
      await signInTeacherWithPasskey(turnstileToken ?? undefined);
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t, 'errPasskeyLoginFailed'));
      // Tokens are single-use: drop it so the page re-gates with a fresh check.
      setTurnstileToken(null);
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileToken(null);
      return;
    }
    setBusy('register');
    try {
      await registerTeacherWithPasskey(displayName, turnstileToken ?? undefined);
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(errorMessage(err, t, 'errPasskeyRegisterFailed'));
      setTurnstileToken(null);
    } finally {
      setBusy(null);
    }
  };

  // Block the page until the bot check passes; the challenge is the only thing
  // on screen while it is loading, waiting for input, or failed.
  if (!gateOpen) {
    return (
      <div className="stack-lg">
        <div className="card stack-md">
          <div className="row">
            <ShieldCheck size={28} />
            <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
              {t('securityCheckTitle')}
            </h1>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {t('securityCheckBody')}
          </p>
          <TurnstileWidget
            action="teacher_auth"
            onToken={setTurnstileToken}
            resetTrigger={0}
          />
        </div>
      </div>
    );
  }

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

        <button
          type="button"
          className="btn btn-primary"
          disabled={!supported || !isOnline || busy !== null}
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

          <button
            type="submit"
            className="btn"
            disabled={!supported || !isOnline || busy !== null}
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
