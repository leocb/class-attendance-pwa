import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fingerprint, GraduationCap, KeyRound, QrCode, UserCheck } from 'lucide-react';
import { useApp } from './AppProvider';
import { getStudentProfile } from '../lib/idb';
import type { StudentProfile } from '../types';

export function HomePage() {
  const { isTeacher } = useApp();
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
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
          Offline-First Classroom Attendance
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Cryptographically signed, rotating 30-second student QR codes scanned
          by passkey-authenticated teachers. Works completely offline after
          one-time student–teacher registration.
        </p>
      </div>

      <div className="grid-2">
        <div className="card stack-md">
          <div className="row">
            <QrCode size={24} color="var(--primary)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Student</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            Register once with your school ID and selfie, then display your live
            signed QR code for attendance.
          </p>

          <div className="stack-sm">
            {studentProfile ? (
              <Link to="/student/qr" className="btn btn-primary">
                <QrCode size={16} />
                Show My Live QR ({studentProfile.name})
              </Link>
            ) : (
              <Link to="/student/register" className="btn btn-primary">
                <UserCheck size={16} />
                Student Registration
              </Link>
            )}
            <Link to="/student/recover" className="btn">
              <KeyRound size={16} />
              Lost Phone / Key Recovery
            </Link>
          </div>
        </div>

        <div className="card stack-md">
          <div className="row">
            <GraduationCap size={24} color="var(--success)" />
            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Teacher</h2>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            Sign in with a hardware or platform passkey, manage classes, scan
            student QRs offline, and export XLSX reports.
          </p>

          <div className="stack-sm">
            {isTeacher ? (
              <Link to="/teacher/classes" className="btn btn-primary">
                <GraduationCap size={16} />
                Open Teacher Classes
              </Link>
            ) : (
              <Link to="/teacher/login" className="btn btn-primary">
                <Fingerprint size={16} />
                Teacher Passkey Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card stack-sm">
        <strong>Install as PWA</strong>
        <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          On iOS Safari tap <strong>Share → Add to Home Screen</strong>. On
          Android Chrome or Desktop tap <strong>Install App</strong> in the
          address bar or header so offline cold-starts work reliably.
        </p>
      </div>
    </div>
  );
}
