import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from '../../../app/AppProvider';
import { useI18n } from '../../../lib/i18n';

export function TeacherGuard({ children }: { children: ReactNode }) {
  const { isTeacher, authLoading } = useApp();
  const { t } = useI18n();

  if (authLoading) {
    return (
      <div className="card">
        <p className="muted">{t('verifyingSession')}</p>
      </div>
    );
  }

  if (!isTeacher) {
    return <Navigate to="/teacher/login" replace />;
  }

  return <>{children}</>;
}
