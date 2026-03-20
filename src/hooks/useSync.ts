import { useEffect, useState } from 'react';

const FALLBACK_REFRESH_INTERVAL_MS = 30000;

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncVersion, setSyncVersion] = useState(0);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
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
  }, []);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    setSyncVersion((currentValue) => currentValue + 1);

    const eventSource = new EventSource('/api/events');

    const handleConnected = () => {
      setIsRealtimeConnected(true);
    };

    const handleSync = () => {
      setSyncVersion((currentValue) => currentValue + 1);
    };

    eventSource.addEventListener('connected', handleConnected);
    eventSource.addEventListener('sync', handleSync);
    eventSource.onerror = () => {
      setIsRealtimeConnected(false);
    };

    const intervalId = window.setInterval(() => {
      setSyncVersion((currentValue) => currentValue + 1);
    }, FALLBACK_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      eventSource.removeEventListener('connected', handleConnected);
      eventSource.removeEventListener('sync', handleSync);
      eventSource.close();
      setIsRealtimeConnected(false);
    };
  }, [isOnline]);

  useEffect(() => {
    const handleFocus = () => {
      if (navigator.onLine) {
        setSyncVersion((currentValue) => currentValue + 1);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        setSyncVersion((currentValue) => currentValue + 1);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    isOnline,
    isSyncing: isOnline && !isRealtimeConnected,
    syncVersion,
  };
}
