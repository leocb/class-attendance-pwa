import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  Fingerprint,
  GraduationCap,
  Moon,
  QrCode,
  Sun,
  UserCheck,
} from 'lucide-react';
import { useApp } from './AppProvider';
import { getStudentProfile } from '../lib/idb';
import { useI18n } from '../lib/i18n';
import { applyTheme, resolveTheme, type Theme } from '../lib/theme';
import type { StudentProfile } from '../types';

export function HomePage() {
  const { isTeacher, authLoading } = useApp();
  const [searchParams] = useSearchParams();
  const menuRequested = searchParams.get('menu') === '1';
  const { t } = useI18n();
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(
    null
  );
  const [theme, setThemeState] = useState<Theme>(() => resolveTheme());

  const chooseTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next, true);
  };

  useEffect(() => {
    let active = true;
    void getStudentProfile()
      .then((p) => {
        if (!active) return;
        setStudentProfile(p ?? null);
      })
      .catch(() => {
        // A missing profile simply means "not registered on this device".
      })
      .finally(() => {
        if (active) setProfileLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!profileLoaded || authLoading) {
    return (
      <div className="card">
        <p className="muted">{t('loadingStudentCreds')}</p>
      </div>
    );
  }

  // Registered students go straight to their live QR on app start. The options
  // button in the navbar requests this menu explicitly (?menu=1), so it must not
  // bounce back to the QR screen.
  if (studentProfile && !isTeacher && !menuRequested) {
    return <Navigate to="/student/qr" replace />;
  }

  return (
    <div className="stack-lg">
      <div className="grid-2">
        <div className="card stack-md">
          <div className="row">
            <QrCode size={24} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('studentTitle')}</h2>
          </div>

          <div className="stack-sm">
            {studentProfile ? (
              <Link to="/student/qr" className="btn btn-primary">
                <QrCode size={16} />
                {t('showMyLiveQr')} ({studentProfile.name})
              </Link>
            ) : (
              <Link to="/student/register" className="btn btn-primary">
                <UserCheck size={16} />
                {t('studentRegistration')}
              </Link>
            )}
          </div>
        </div>

        <div className="card stack-md">
          <div className="row">
            <GraduationCap size={24} color="var(--success)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('teacherTitle')}</h2>
          </div>

          <div className="stack-sm">
            {isTeacher ? (
              <Link to="/teacher/classes" className="btn btn-primary">
                <GraduationCap size={16} />
                {t('openTeacherClasses')}
              </Link>
            ) : (
              <Link to="/teacher/login" className="btn btn-primary">
                <Fingerprint size={16} />
                {t('teacherPasskeySignIn')}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div
        className="card row-between"
        style={{ flexWrap: 'wrap', gap: '0.75rem' }}
      >
        <strong>{t('theme')}</strong>
        <div className="row" style={{ gap: '0.4rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : ''}`}
            aria-pressed={theme === 'light'}
            onClick={() => chooseTheme('light')}
          >
            <Sun size={14} />
            {t('light')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : ''}`}
            aria-pressed={theme === 'dark'}
            onClick={() => chooseTheme('dark')}
          >
            <Moon size={14} />
            {t('dark')}
          </button>
        </div>
      </div>

      <div className="card stack-sm">
        <strong>{t('installPwaTitle')}</strong>
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          {t('installPwaDesc')}
        </p>
      </div>

      <footer className="app-footer muted">
        <span>
          v{__APP_VERSION__}
          {__APP_COMMIT__ ? (
            <>
              {' · '}
              <a
                href={`https://github.com/leocb/class-attendance-pwa/commit/${__APP_COMMIT__}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                {__APP_COMMIT__.slice(0, 7)}
              </a>
            </>
          ) : null}
        </span>
        <span>
          {t('createdBy')}:{' '}
          <a
            href="https://github.com/leocb"
            target="_blank"
            rel="noreferrer noopener"
          >
            github.com/leocb
          </a>
        </span>
      </footer>
    </div>
  );
}
