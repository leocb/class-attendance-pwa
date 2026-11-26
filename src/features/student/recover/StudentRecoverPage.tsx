import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { SelfieCapture } from '../../../components/SelfieCapture';
import { TurnstileWidget } from '../../../components/TurnstileWidget';
import { CONFIG } from '../../../lib/config';
import { errorMessage } from '../../../lib/errors';
import type { EncodedSelfie } from '../../../lib/image/selfie';
import {
  computeFingerprintFromSpki,
  exportPublicKeyJwk,
  exportSpkiBytes,
  generateStudentKeyPair,
} from '../../../lib/crypto';
import {
  replaceStudentPrivateKeyForRecovery,
  saveStudentProfile,
} from '../../../lib/idb';
import {
  ensureStudentAnonymousAuth,
  verifyOnlineTurnstile,
} from '../../../lib/firebase/auth';
import {
  buildSelfieStoragePath,
  uploadStudentSelfie,
} from '../../../lib/firebase/storage';
import { syncServerOffset } from '../../../lib/time';
import { useI18n } from '../../../lib/i18n';
import type { StudentProfile } from '../../../types';

export function StudentRecoverPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [schoolStudentId, setSchoolStudentId] = useState('');
  const [name, setName] = useState('');
  const [selfie, setSelfie] = useState<EncodedSelfie | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const requireOnlineTurnstile =
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
    CONFIG.TURNSTILE_ENABLED;

  const handleRecover = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const sid = schoolStudentId.trim();
    const fullName = name.trim();
    if (!sid || !fullName) {
      setError(t('errMissingIdName'));
      return;
    }
    if (!selfie) {
      setError(t('errRecoverSelfie'));
      return;
    }
    if (navigator.onLine && CONFIG.TURNSTILE_ENABLED && !turnstileToken) {
      setError(t('errTurnstileRequired'));
      return;
    }

    setSubmitting(true);
    try {
      if (navigator.onLine && CONFIG.TURNSTILE_ENABLED && turnstileToken) {
        await verifyOnlineTurnstile(turnstileToken, 'student_recover');
      }
      const keyPair = await generateStudentKeyPair();
      const [spkiBytes, publicKeyJwk] = await Promise.all([
        exportSpkiBytes(keyPair.publicKey),
        exportPublicKeyJwk(keyPair.publicKey),
      ]);
      const keyFingerprint = await computeFingerprintFromSpki(spkiBytes);
      const selfiePath = buildSelfieStoragePath(sid, keyFingerprint);

      // Replace local private key; DO NOT write to Firestore students/{sid}
      await replaceStudentPrivateKeyForRecovery(keyPair.privateKey);
      if (navigator.onLine) {
        await syncServerOffset();
      }

      let deviceUid = 'recovery';
      let selfieUploaded = false;
      if (navigator.onLine) {
        const user = await ensureStudentAnonymousAuth();
        deviceUid = user.uid;
        await uploadStudentSelfie({
          sid,
          fp: keyFingerprint,
          deviceUid: user.uid,
          bytes: selfie.bytes,
        });
        selfieUploaded = true;
      }

      const profile: StudentProfile = {
        schoolStudentId: sid,
        name: fullName,
        deviceUid,
        publicKeyJwk,
        keyFingerprint,
        selfiePath,
        selfieHash: selfie.sha256Hex,
        selfieDataUrl: selfie.dataUrl,
        ...(selfieUploaded ? {} : { selfieBytes: selfie.bytes }),
        selfieUploaded,
        registrationTimestamp: Date.now(),
        isRecovery: true,
      };

      await saveStudentProfile(profile);
      navigate('/student/qr');
    } catch (err) {
      setError(errorMessage(err, t, 'errRecoverFailed'));
    } finally {
      setSubmitting(false);
      setTurnstileReset((n) => n + 1);
    }
  };

  return (
    <div className="card stack-md">
      <div className="row">
        <KeyRound size={24} />
        <div>
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
            {t('studentRecoverTitle')}
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {t('studentRecoverSubtitle')}
          </p>
        </div>
      </div>

      <div className="alert alert-warning">{t('studentRecoverWarning')}</div>

      {error && <div className="alert alert-danger">{error}</div>}

      <form onSubmit={handleRecover} className="stack-md">
        <div>
          <label className="label" htmlFor="recover-sid">
            {t('schoolStudentId')}
          </label>
          <input
            id="recover-sid"
            className="input"
            placeholder={t('schoolStudentIdPlaceholder')}
            value={schoolStudentId}
            onChange={(e) => setSchoolStudentId(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="recover-name">
            {t('fullName')}
          </label>
          <input
            id="recover-name"
            className="input"
            placeholder={t('fullNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <SelfieCapture value={selfie} onChange={setSelfie} />

        {requireOnlineTurnstile && (
          <TurnstileWidget
            action="student_recover"
            onToken={setTurnstileToken}
            resetTrigger={turnstileReset}
          />
        )}

        <div className="row-between">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              submitting || (requireOnlineTurnstile && !turnstileToken)
            }
          >
            {submitting ? t('generatingNewKey') : t('generateRecoveryQr')}
          </button>
          <Link
            to="/student/register"
            className="muted"
            style={{ fontSize: '0.88rem' }}
          >
            {t('backToRegistration')}
          </Link>
        </div>
      </form>
    </div>
  );
}
