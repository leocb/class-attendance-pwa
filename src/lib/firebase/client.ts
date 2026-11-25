import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-class-attendance',
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

if (getApps().length === 0) {
  appInstance = initializeApp(firebaseConfig);
  firestoreInstance = initializeFirestore(appInstance, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  authInstance = getAuth(appInstance);
  functionsInstance = getFunctions(appInstance);

  if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
    connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
  }
} else {
  appInstance = getApps()[0];
  firestoreInstance = getFirestore(appInstance);
  authInstance = getAuth(appInstance);
  functionsInstance = getFunctions(appInstance);
}

export const firebaseApp = appInstance;
export const db = firestoreInstance;
export const auth = authInstance;
export const functions = functionsInstance;
