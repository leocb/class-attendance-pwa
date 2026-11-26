import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { SelfieCapture } from '../../../components/SelfieCapture';
import { TurnstileWidget } from '../../../components/TurnstileWidget';
import { CONFIG } from '../../../lib/config';
import { LocalizedError, errorMessage } from '../../../lib/errors';
import type { EncodedSelfie } from '../../../lib/image/selfie';
import {
  computeFingerprintFromSpki,
  exportPublicKeyJwk,
  exportSpkiBytes,
  generateStudentKeyPair,
} from '../../../lib/crypto';
import {
  getStudentPrivateKey,
  getStudentProfile,
  saveStudentPrivateKeyInitial,
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

export function StudentRegisterPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [schoolStudentId, setSchoolStudentId] = useState('');
  const [name, setName] = useState('');
  const [selfie, setSelfie] = useState<EncodedSelfie | null>(null);
  const [existingProfile, setExistingProfile] = useState<StudentProfile | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const requireOnlineTurnstile =
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
    CONFIG.TURNSTILE_ENABLED;

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
      setError(t('errMissingIdName'));
      return;
    }
    if (!selfie) {
      setError(t('errMissingSelfie'));
      return;
    }
    if (navigator.onLine && CONFIG.TURNSTILE_ENABLED && !turnstileToken) {
      setError(t('errTurnstileRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const existingKey = await getStudentPrivateKey();
      if (existingKey) {
        throw new LocalizedError('errExistingKey');
      }

      if (navigator.onLine && CONFIG.TURNSTILE_ENABLED && turnstileToken) {
        await verifyOnlineTurnstile(turnstileToken, 'student_register');
      }

      const user = await ensureStudentAnonymousAuth();
      const keyPair = await generateStudentKeyPair();
      const [spkiBytes, publicKeyJwk] = await Promise.all([
        exportSpkiBytes(keyPair.publicKey),
        exportPublicKeyJwk(keyPair.publicKey),
      ]);
      const keyFingerprint = await computeFingerprintFromSpki(spkiBytes);
      const selfiePath = buildSelfieStoragePath(sid, keyFingerprint);
      const selfieHash = selfie.sha256Hex;
      const registrationTimestamp = Date.now();

      await saveStudentPrivateKeyInitial(keyPair.privateKey);
      if (navigator.onLine) {
        await syncServerOffset();
      }

      let selfieUploaded = false;
      if (navigator.onLine) {
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
        deviceUid: user.uid,
        publicKeyJwk,
        keyFingerprint,
        selfiePath,
        selfieHash,
        selfieDataUrl: selfie.dataUrl,
        ...(selfieUploaded ? {} : { selfieBytes: selfie.bytes }),
        selfieUploaded,
        registrationTimestamp,
        isRecovery: false,
      };

      await saveStudentProfile(profile);

      setSuccessMsg(t('regSuccess'));
      window.setTimeout(() => {
        navigate('/student/qr');
      }, 900);
    } catch (err) {
      setError(errorMessage(err, t, 'errRegFailed'));
    } finally {
      setSubmitting(false);
      setTurnstileReset((n) => n + 1);
    }
  };

  if (existingProfile) {
    return (
      <div className="card stack-md">
        <h2>{t('alreadyRegisteredTitle')}</h2>
        <p className="muted">
          {t('registeredAs')} <strong>{existingProfile.name}</strong> (
          <span className="mono">{existingProfile.schoolStudentId}</span>).{' '}
          {t('alreadyRegisteredBody')}
        </p>
        <div className="row">
          <Link to="/student/qr" className="btn btn-primary">
            {t('openLiveQr')}
          </Link>
          <Link to="/student/recover" className="btn">
            <KeyRound size={16} />
            {t('rotateRecoverKey')}
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
          <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
            {t('studentRegistration')}
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            {t('studentRegSubtitle')}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <form onSubmit={handleSubmit} className="stack-md">
        <div>
          <label className="label" htmlFor="sid">
            {t('schoolStudentId')}
          </label>
          <input
            id="sid"
            className="input"
            placeholder={t('schoolStudentIdPlaceholder')}
            value={schoolStudentId}
            onChange={(e) => setSchoolStudentId(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="fullName">
            {t('fullName')}
          </label>
          <input
            id="fullName"
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
            action="student_register"
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
            {submitting ? t('generatingKey') : t('completeRegistration')}
          </button>
          <Link
            to="/student/recover"
            className="muted"
            style={{ fontSize: '0.88rem' }}
          >
            {t('lostPhoneLink')}
          </Link>
        </div>
      </form>
    </div>
  );
}
