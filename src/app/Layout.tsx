import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Download,
  LogOut,
  QrCode,
  Wifi,
  WifiOff,
  GraduationCap,
} from 'lucide-react';
import { useApp } from './AppProvider';
import { signOutTeacher } from '../lib/firebase/auth';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function Layout({ children }: { children: ReactNode }) {
  const { isOnline, isTeacher } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const handleSignOut = async () => {
    await signOutTeacher();
    navigate('/teacher/login');
  };

  const inTeacherArea = location.pathname.startsWith('/teacher');

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          <QrCode size={22} />
          <span>ClassAttend</span>
        </Link>

        <div className="topbar-actions">
          <span
            className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}
            aria-live="polite"
          >
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {installEvent && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleInstall}
            >
              <Download size={14} />
              Install App
            </button>
          )}

          {inTeacherArea && isTeacher && (
            <>
              <Link to="/teacher/classes" className="btn btn-sm">
                <GraduationCap size={14} />
                Classes
              </Link>
              <Link to="/teacher/export" className="btn btn-sm">
                Export
              </Link>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="main-container">{children}</main>
    </div>
  );
}
