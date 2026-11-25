import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../lib/firebase/client';
import { isTeacherAuthenticated } from '../lib/firebase/auth';
import { syncServerOffset } from '../lib/time';
import { CONFIG } from '../lib/config';

interface AppContextValue {
  user: User | null;
  isTeacher: boolean;
  authLoading: boolean;
  isOnline: boolean;
  lastTimeSyncAt: number | null;
  refreshTimeSync: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastTimeSyncAt, setLastTimeSyncAt] = useState<number | null>(null);

  const refreshTimeSync = async () => {
    const rec = await syncServerOffset();
    if (rec) {
      setLastTimeSyncAt(rec.offsetSyncedAt);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const teacherClaim = await isTeacherAuthenticated(nextUser);
          setIsTeacher(teacherClaim);
        } catch {
          setIsTeacher(false);
        }
      } else {
        setIsTeacher(false);
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void refreshTimeSync();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Sync server time offset on start and every 10 minutes while online (§6.4)
    void refreshTimeSync();
    const timer = window.setInterval(() => {
      if (navigator.onLine) {
        void refreshTimeSync();
      }
    }, CONFIG.TIME_SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        isTeacher,
        authLoading,
        isOnline,
        lastTimeSyncAt,
        refreshTimeSync,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
