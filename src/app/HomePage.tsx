import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, GraduationCap, KeyRound, QrCode, UserCheck } from 'lucide-react';
import { useApp } from './AppProvider';
import { getStudentProfile } from '../lib/idb';
import { useI18n } from '../lib/i18n';
import type { StudentProfile } from '../types';

export function HomePage() {
  const { isTeacher } = useApp();
  const { t } = useI18n();
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(
    null
  );

  useEffect(() => {
    void getStudentProfile().then((p) => {
      if (p) setStudentProfile(p);
    });
  }, []);

  return (
    <div className="stack-lg">
      <div className="card stack-sm">
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{t('homeTitle')}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('homeSubtitle')}
        </p>
      </div>

      <div className="grid-2">
        <div className="card stack-md">
          <div className="row">
            <QrCode size={24} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('studentTitle')}</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            {t('studentDesc')}
          </p>

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
            <Link to="/student/recover" className="btn">
              <KeyRound size={16} />
              {t('lostPhoneRecover')}
            </Link>
          </div>
        </div>

        <div className="card stack-md">
          <div className="row">
            <GraduationCap size={24} color="var(--success)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{t('teacherTitle')}</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            {t('teacherDesc')}
          </p>

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

      <div className="card stack-sm">
        <strong>{t('installPwaTitle')}</strong>
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          {t('installPwaDesc')}
        </p>
      </div>
    </div>
  );
}
