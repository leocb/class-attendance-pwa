import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Download,
  Globe,
  GraduationCap,
  LogOut,
  QrCode,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from './AppProvider';
import { signOutTeacher } from '../lib/firebase/auth';
import { useI18n, type Locale } from '../lib/i18n';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function Layout({ children }: { children: ReactNode }) {
  const { isOnline, isTeacher } = useApp();
  const { locale, setLocale, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
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

  const chooseLocale = (next: Locale) => {
    setLocale(next);
    setLangOpen(false);
  };

  const inTeacherArea = location.pathname.startsWith('/teacher');

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          <QrCode size={22} color="var(--primary)" />
          <span>{t('appName')}</span>
        </Link>

        <div className="topbar-actions">
          <span
            className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}
            aria-live="polite"
          >
            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
            {isOnline ? t('online') : t('offline')}
          </span>

          <div ref={langMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-sm"
              aria-label={t('language')}
              aria-expanded={langOpen}
              onClick={() => setLangOpen((o) => !o)}
            >
              <Globe size={14} />
              <span>{locale === 'pt-BR' ? 'PT' : 'EN'}</span>
              <ChevronDown size={13} />
            </button>
            {langOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  minWidth: 185,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  boxShadow: 'var(--shadow)',
                  padding: '0.35rem',
                  zIndex: 60,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === 'en'}
                  className={`btn btn-sm ${locale === 'en' ? 'btn-primary' : ''}`}
                  style={{ justifyContent: 'flex-start', border: 'none' }}
                  onClick={() => chooseLocale('en')}
                >
                  {t('english')}
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={locale === 'pt-BR'}
                  className={`btn btn-sm ${locale === 'pt-BR' ? 'btn-primary' : ''}`}
                  style={{ justifyContent: 'flex-start', border: 'none' }}
                  onClick={() => chooseLocale('pt-BR')}
                >
                  {t('portugueseBr')}
                </button>
              </div>
            )}
          </div>

          {installEvent && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handleInstall}
            >
              <Download size={14} />
              {t('installApp')}
            </button>
          )}

          {inTeacherArea && isTeacher && (
            <>
              <Link to="/teacher/classes" className="btn btn-sm">
                <GraduationCap size={14} />
                {t('classes')}
              </Link>
              <Link to="/teacher/export" className="btn btn-sm">
                {t('export')}
              </Link>
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleSignOut}
                title={t('signOut')}
                aria-label={t('signOut')}
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
