import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useApp } from '../../../app/AppProvider';

export function TeacherGuard({ children }: { children: ReactNode }) {
  const { isTeacher, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="card">
        <p className="muted">Verifying teacher session…</p>
      </div>
    );
  }

  if (!isTeacher) {
    return <Navigate to="/teacher/login" replace />;
  }

  return <>{children}</>;
}
