import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
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
  replaceStudentPrivateKeyForRecovery,
  saveStudentProfile,
} from '../../../lib/idb';
import { syncServerOffset } from '../../../lib/time';
import type { StudentProfile } from '../../../types';

export function StudentRecoverPage() {
  const navigate = useNavigate();
  const [schoolStudentId, setSchoolStudentId] = useState('');
  const [name, setName] = useState('');
  const [selfie, setSelfie] = useState<EncodedSelfie | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecover = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const sid = schoolStudentId.trim();
    const fullName = name.trim();
    if (!sid || !fullName) {
      setError('Enter your School Student ID and Full Name.');
      return;
    }
    if (!selfie) {
      setError('Capture a new live selfie so your teacher can verify your identity.');
      return;
    }

    setSubmitting(true);
    try {
      const keyPair = await generateStudentKeyPair();
      const [spkiBytes, publicKeyJwk, selfieHash] = await Promise.all([
        exportSpkiBytes(keyPair.publicKey),
        exportPublicKeyJwk(keyPair.publicKey),
        sha256Hex(selfie.base64),
      ]);
      const keyFingerprint = await computeFingerprintFromSpki(spkiBytes);

      // §6.3: Generate new keypair locally; DO NOT attempt any Firestore write.
      await replaceStudentPrivateKeyForRecovery(keyPair.privateKey);
      if (navigator.onLine) {
        await syncServerOffset();
      }

      const profile: StudentProfile = {
        schoolStudentId: sid,
        name: fullName,
        deviceUid: 'recovery',
        publicKeyJwk,
        keyFingerprint,
        selfieThumb: selfie.base64,
        selfieHash,
        registrationTimestamp: Date.now(),
        isRecovery: true,
        firestoreSynced: false,
      };

      await saveStudentProfile(profile);
      navigate('/student/qr');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to prepare key recovery.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card stack-md">
      <div className="row">
        <KeyRound size={24} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Student Key Recovery</h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Lost your phone or cleared browser data? Generate a new device key
            and show the resulting QR to your teacher.
          </p>
        </div>
      </div>

      <div className="alert alert-warning">
        Your teacher must be online the first time they scan your recovered QR
        so they can review your new selfie and approve the key rotation.
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleRecover} className="stack-md">
        <div>
          <label className="label" htmlFor="recover-sid">
            School Student ID
          </label>
          <input
            id="recover-sid"
            className="input"
            placeholder="e.g. A12345678"
            value={schoolStudentId}
            onChange={(e) => setSchoolStudentId(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="recover-name">
            Full Name
          </label>
          <input
            id="recover-name"
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
            {submitting ? 'Generating New Key…' : 'Generate Recovery QR'}
          </button>
          <Link to="/student/register" className="muted" style={{ fontSize: '0.88rem' }}>
            Back to Registration
          </Link>
        </div>
      </form>
    </div>
  );
}
