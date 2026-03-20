import { useCallback, useEffect, useRef, useState } from 'react';
import { flushPendingMutations } from '../offlineSync';

interface RunSyncOptions {
  refreshServerData?: boolean;
}

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncVersion, setSyncVersion] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const runSync = useCallback(async ({ refreshServerData = false }: RunSyncOptions = {}) => {
    if (!navigator.onLine) {
      return false;
    }

    const runTask = async () => {
      setIsSyncing(true);

      try {
        const result = await flushPendingMutations();

        if (refreshServerData && result.pendingCount === 0) {
          setSyncVersion((currentValue) => currentValue + 1);
        }
      } finally {
        setIsSyncing(false);
      }
    };

    syncChainRef.current = syncChainRef.current.catch(() => undefined).then(runTask);
    await syncChainRef.current;
    return true;
  }, []);

  useEffect(() => {
    if (navigator.onLine) {
      void runSync();
    }
  }, [runSync]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void runSync({ refreshServerData: true });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsRealtimeConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runSync]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const eventSource = new EventSource('/api/events');
    let hasConnectedOnce = false;

    const handleConnected = () => {
      setIsRealtimeConnected(true);

      if (hasConnectedOnce) {
        void runSync({ refreshServerData: true });
      }

      hasConnectedOnce = true;
    };

    const handleSync = () => {
      void runSync({ refreshServerData: true });
    };

    eventSource.addEventListener('connected', handleConnected);
    eventSource.addEventListener('sync', handleSync);
    eventSource.onerror = () => {
      setIsRealtimeConnected(false);
    };

    return () => {
      eventSource.removeEventListener('connected', handleConnected);
      eventSource.removeEventListener('sync', handleSync);
      eventSource.close();
      setIsRealtimeConnected(false);
    };
  }, [isOnline, runSync]);

  return {
    isOnline,
    isSyncing,
    isRealtimeConnected,
    syncVersion,
  };
}
