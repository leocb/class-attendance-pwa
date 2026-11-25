import {
  signInAnonymously,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { auth } from './client';
import { CONFIG } from '../config';
import { clearTeacherCaches } from '../idb';

function passkeyEndpoint(path: string): string {
  return `${CONFIG.FUNCTIONS_BASE_URL}/api/passkey${path}`;
}

export async function verifyOnlineTurnstile(
  turnstileToken: string,
  action: 'student_register' | 'student_recover'
): Promise<void> {
  const res = await fetch(`${CONFIG.FUNCTIONS_BASE_URL}/api/turnstile/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstileToken, action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Bot verification failed.');
  }
}

export async function ensureStudentAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn();
}

export async function registerTeacherWithPasskey(
  displayName?: string,
  turnstileToken?: string
): Promise<User> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('Passkeys (WebAuthn) are not supported on this browser.');
  }

  const optionsRes = await fetch(passkeyEndpoint('/register/options'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: displayName?.trim() || 'Teacher',
      turnstileToken,
    }),
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start passkey registration.');
  }

  const { challengeId, options } = await optionsRes.json();
  const attestation = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch(passkeyEndpoint('/register/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, response: attestation }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || 'Passkey registration verification failed.');
  }

  const { customToken } = (await verifyRes.json()) as { customToken: string };
  const userCred = await signInWithCustomToken(auth, customToken);
  await userCred.user.getIdToken(true);
  return userCred.user;
}

export async function signInTeacherWithPasskey(
  turnstileToken?: string
): Promise<User> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('Passkeys (WebAuthn) are not supported on this browser.');
  }

  const optionsRes = await fetch(passkeyEndpoint('/login/options'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstileToken }),
  });

  if (!optionsRes.ok) {
    const err = await optionsRes.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to start passkey sign-in.');
  }

  const { challengeId, options } = await optionsRes.json();
  const assertion = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch(passkeyEndpoint('/login/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, response: assertion }),
  });

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    throw new Error(err.error || 'Passkey sign-in verification failed.');
  }

  const { customToken } = (await verifyRes.json()) as { customToken: string };
  const userCred = await signInWithCustomToken(auth, customToken);
  await userCred.user.getIdToken(true);
  return userCred.user;
}

export async function signOutTeacher(): Promise<void> {
  await Promise.all([firebaseSignOut(auth), clearTeacherCaches()]);
}

export async function isTeacherAuthenticated(user: User | null): Promise<boolean> {
  if (!user || user.isAnonymous) return false;
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.teacher === true;
}
