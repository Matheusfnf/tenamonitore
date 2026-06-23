import NetInfo from '@react-native-community/netinfo';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { runSync } from '@/sync/sync';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncState | undefined>(undefined);

const PERIODIC_MS = 5 * 60 * 1000; // 5 min

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const running = useRef(false);

  const syncNow = useCallback(async () => {
    if (!session || running.current) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      setStatus('offline');
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      await runSync();
      setStatus('idle');
      setLastSyncedAt(Date.now());
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[sync] erro ao sincronizar', e);
      setStatus('error');
    } finally {
      running.current = false;
    }
  }, [session]);

  // sincroniza ao logar
  useEffect(() => {
    if (session) void syncNow();
  }, [session, syncNow]);

  // sincroniza ao reconectar + periodicamente
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && session) void syncNow();
    });
    const id = setInterval(() => {
      if (session) void syncNow();
    }, PERIODIC_MS);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, [session, syncNow]);

  const value = useMemo<SyncState>(
    () => ({ status, lastSyncedAt, syncNow }),
    [status, lastSyncedAt, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncState {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync deve ser usado dentro de <SyncProvider>');
  return ctx;
}
