import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { SelfieCapture } from '../../../components/SelfieCapture';
import type { EncodedSelfie } from '../../../lib/image/selfie';
import {
  computeFingerprintFromSpki,
  exportPublicKeyJwk,
  exportSpkiBytes,
  generateStudentKeyPair,
  sha256Hex,
} from '../../../lib/crypto';
import {
  getStudentPrivateKey,
  getStudentProfile,
  saveStudentPrivateKeyInitial,
  saveStudentProfile,
} from '../../../lib/idb';
import { ensureStudentAnonymousAuth } from '../../../lib/firebase/auth';
import { db } from '../../../lib/firebase/client';
import { syncServerOffset } from '../../../lib/time';
import type { Student, StudentProfile } from '../../../types';

export function StudentRegisterPage() {
  const navigate = useNavigate();
  const [schoolStudentId, setSchoolStudentId] = useState('');
  const [name, setName] = useState('');
  const [selfie, setSelfie] = useState<EncodedSelfie | null>(null);
  const [existingProfile, setExistingProfile] = useState<StudentProfile | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [profile, key] = await Promise.all([
        getStudentProfile(),
        getStudentPrivateKey(),
      ]);
      if (profile && key) {
        setExistingProfile(profile);
      }
    })();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const sid = schoolStudentId.trim();
    const fullName = name.trim();
    if (!sid || !fullName) {
      setError('Please enter both your School Student ID and Full Name.');
      return;
    }
    if (!selfie) {
      setError('Please capture or upload a selfie thumbnail.');
      return;
    }

    setSubmitting(true);
    try {
      // Immutability check (§5.1): refuse to overwrite an existing key on register
      const existingKey = await getStudentPrivateKey();
      if (existingKey) {
        throw new Error(
          'A key already exists on this device. Open your QR or use Recovery if needed.'
        );
      }

      const user = await ensureStudentAnonymousAuth();
      const keyPair = await generateStudentKeyPair();
      const [spkiBytes, publicKeyJwk, selfieHash] = await Promise.all([
        exportSpkiBytes(keyPair.publicKey),
        exportPublicKeyJwk(keyPair.publicKey),
        sha256Hex(selfie.base64),
      ]);
      const keyFingerprint = await computeFingerprintFromSpki(spkiBytes);
      const registrationTimestamp = Date.now();

      await saveStudentPrivateKeyInitial(keyPair.privateKey);
      if (navigator.onLine) {
        await syncServerOffset();
      }

      const studentDoc: Student = {
        schoolStudentId: sid,
        name: fullName,
        deviceUid: user.uid,
        publicKeyJwk,
        keyFingerprint,
        selfieThumb: selfie.base64,
        selfieHash,
        registrationTimestamp,
        authorizedTeacherUids: [],
        rotatedKeys: [],
      };

      const profile: StudentProfile = {
        schoolStudentId: sid,
        name: fullName,
        deviceUid: user.uid,
        publicKeyJwk,
        keyFingerprint,
        selfieThumb: selfie.base64,
        selfieHash,
        registrationTimestamp,
        isRecovery: false,
        firestoreSynced: false,
      };

      await saveStudentProfile(profile);

      const writePromise = setDoc(doc(db, 'students', sid), studentDoc).then(
        async () => {
          await saveStudentProfile({ ...profile, firestoreSynced: true });
        }
      );

      if (navigator.onLine) {
        try {
          await writePromise;
        } catch (err) {
          // If duplicate registration rejected by Firestore rules, report clearly
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
            throw new Error(
              'This School Student ID is already registered. If you got a new phone or cleared storage, use Key Recovery.'
            );
          }
          // Otherwise let offline persistence queue it
          void writePromise.catch(() => {});
        }
      } else {
        // Offline: Firestore persistence queues the create write automatically (§6.1)
        void writePromise.catch(() => {});
      }

      setSuccessMsg(
        'Registration complete. Your teacher will add you when they scan your QR.'
      );
      window.setTimeout(() => {
        navigate('/student/qr');
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Student registration failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (existingProfile) {
    return (
      <div className="card stack-md">
        <h2>Student Device Already Registered</h2>
        <p className="muted">
          Registered as <strong>{existingProfile.name}</strong> (
          <span className="mono">{existingProfile.schoolStudentId}</span>). Your
          non-extractable signing key is locked in this browser.
        </p>
        <div className="row">
          <Link to="/student/qr" className="btn btn-primary">
            Open Live QR
          </Link>
          <Link to="/student/recover" className="btn">
            <KeyRound size={16} />
            Rotate / Recover Key
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack-md">
      <div className="row">
        <ShieldCheck size={24} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Student Registration</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            One-time setup. Your signing key never leaves this device.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <form onSubmit={handleSubmit} className="stack-md">
        <div>
          <label className="label" htmlFor="sid">
            School Student ID
          </label>
          <input
            id="sid"
            className="input"
            placeholder="e.g. A12345678"
            value={schoolStudentId}
            onChange={(e) => setSchoolStudentId(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="fullName">
            Full Name
          </label>
          <input
            id="fullName"
            className="input"
            placeholder="e.g. Jane Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <SelfieCapture value={selfie} onChange={setSelfie} />

        <div className="row-between">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Generating Key & Registering…' : 'Complete Registration'}
          </button>
          <Link to="/student/recover" className="muted" style={{ fontSize: '0.88rem' }}>
            Lost phone or cleared data? Recover key
          </Link>
        </div>
      </form>
    </div>
  );
}
