import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './lib/i18n';
import { AppProvider } from './app/AppProvider';
import { Layout } from './app/Layout';
import { HomePage } from './app/HomePage';
import { StudentRegisterPage } from './features/student/register/StudentRegisterPage';
import { StudentQrPage } from './features/student/qr/StudentQrPage';
import { StudentRecoverPage } from './features/student/recover/StudentRecoverPage';
import { TeacherLoginPage } from './features/teacher/auth/TeacherLoginPage';
import { TeacherGuard } from './features/teacher/auth/TeacherGuard';
import { TeacherClassesPage } from './features/teacher/classes/TeacherClassesPage';
import { TeacherScanPage } from './features/teacher/scan/TeacherScanPage';
import { TeacherExportPage } from './features/teacher/export/TeacherExportPage';

export function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <AppProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/student/register" element={<StudentRegisterPage />} />
              <Route path="/student/qr" element={<StudentQrPage />} />
              <Route path="/student/recover" element={<StudentRecoverPage />} />

              <Route path="/teacher/login" element={<TeacherLoginPage />} />
              <Route
                path="/teacher/classes"
                element={
                  <TeacherGuard>
                    <TeacherClassesPage />
                  </TeacherGuard>
                }
              />
              <Route
                path="/teacher/scan/:classId"
                element={
                  <TeacherGuard>
                    <TeacherScanPage />
                  </TeacherGuard>
                }
              />
              <Route
                path="/teacher/export"
                element={
                  <TeacherGuard>
                    <TeacherExportPage />
                  </TeacherGuard>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </AppProvider>
      </BrowserRouter>
    </I18nProvider>
  );
}

export default App;
