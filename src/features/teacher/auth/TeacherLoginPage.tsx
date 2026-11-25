import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Fingerprint, KeyRound, UserPlus } from 'lucide-react';
import { useApp } from '../../../app/AppProvider';
import {
  isPasskeySupported,
  registerTeacherWithPasskey,
  signInTeacherWithPasskey,
} from '../../../lib/firebase/auth';

export function TeacherLoginPage() {
  const { isTeacher, isOnline } = useApp();
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
            <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Teacher Passkey Sign In</h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              Passkey-only authentication. Once signed in, scanning and Excel
              export work offline.
            </p>
          </div>
        </div>

        {!supported && (
          <div className="alert alert-danger">
            WebAuthn passkeys are not supported in this browser or context (HTTPS
            is required).
          </div>
        )}

        {!isOnline && (
          <div className="alert alert-warning">
            You are currently offline. Signing in with a passkey requires an
            internet connection to mint a session token.
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        <button
          type="button"
          className="btn btn-primary"
          disabled={!supported || !isOnline || busy !== null}
          onClick={handleLogin}
        >
          <KeyRound size={18} />
          {busy === 'login' ? 'Waiting for Passkey…' : 'Sign in with Passkey'}
        </button>
      </div>

      <div className="card stack-md">
        <div className="row">
          <UserPlus size={22} />
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Create Teacher Account</h2>
        </div>

        <div className="alert alert-warning row" style={{ alignItems: 'flex-start' }}>
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Permanent account warning — no recovery:</strong> There is
            no email, no password, and no &ldquo;forgot passkey&rdquo; reset. If
            you delete or lose this passkey, your teacher account and access to
            your classes are permanently gone.
          </div>
        </div>

        <form onSubmit={handleRegister} className="stack-md">
          <div>
            <label className="label" htmlFor="teacher-name">
              Display Name (shown on your passkey prompt)
            </label>
            <input
              id="teacher-name"
              className="input"
              placeholder="e.g. Prof. Rivera"
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
              ? 'Creating Passkey Account…'
              : 'Create account with Passkey'}
          </button>
        </form>
      </div>
    </div>
  );
}
