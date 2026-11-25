import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Fingerprint, KeyRound, UserPlus } from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
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

  useEffect(() => {
    if (isTeacher) {
      navigate('/teacher/classes', { replace: true });
    }
  }, [isTeacher, navigate]);

  const supported = isPasskeySupported();

  const handleLogin = async () => {
    setError(null);
    setBusy('login');
    try {
      await signInTeacherWithPasskey();
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('register');
    try {
      await registerTeacherWithPasskey(displayName);
      navigate('/teacher/classes', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Passkey account creation failed.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack-lg">
      <div className="card stack-md">
        <div className="row">
          <Fingerprint size={28} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
              {t('teacherPasskeySignIn')}
            </h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              {t('teacherPasskeySubtitle')}
            </p>
          </div>
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

        <div className="alert alert-warning row" style={{ alignItems: 'flex-start' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>{t('permanentWarningTitle')}</strong>{' '}
            {t('permanentWarningBody')}
          </div>
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
