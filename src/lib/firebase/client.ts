import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-class-attendance',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    'demo-class-attendance.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
};

export const isFirebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_API_KEY !== 'your-api-key'
);

let appInstance: FirebaseApp;
let firestoreInstance: Firestore;
let authInstance: Auth;
let functionsInstance: Functions;
let storageInstance: FirebaseStorage;

if (getApps().length === 0) {
  appInstance = initializeApp(firebaseConfig);

  // Opt-in Firebase App Check (reCAPTCHA v3). Enable by setting
  // VITE_APP_CHECK_SITE_KEY after registering the web app in
  // Firebase Console → App Check. Enforcement stays a console-side switch.
  const appCheckSiteKey = import.meta.env.VITE_APP_CHECK_SITE_KEY as
    | string
    | undefined;
  if (appCheckSiteKey) {
    initializeAppCheck(appInstance, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  firestoreInstance = initializeFirestore(appInstance, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  authInstance = getAuth(appInstance);
  functionsInstance = getFunctions(appInstance, 'southamerica-east1');
  storageInstance = getStorage(appInstance);

  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
    connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
    connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
  }
} else {
  appInstance = getApps()[0];
  firestoreInstance = getFirestore(appInstance);
  authInstance = getAuth(appInstance);
  functionsInstance = getFunctions(appInstance, 'southamerica-east1');
  storageInstance = getStorage(appInstance);
}

export const firebaseApp = appInstance;
export const db = firestoreInstance;
export const auth = authInstance;
export const functions = functionsInstance;
export const storage = storageInstance;
