import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

const FALLBACK_SYNC_POLL_INTERVAL_MS = 30000;

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const mutations = useLiveQuery(() => db.mutations.toArray());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const sync = async () => {
    if (!isOnline || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const [territoryCount, apartmentCount] = await Promise.all([
        db.territories.count(),
        db.apartments.count(),
      ]);

      // 1. Push mutations
      const pendingMutations = await db.mutations.toArray();
      let canPullRemoteChanges = true;

      if (pendingMutations.length > 0) {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutations: pendingMutations }),
        });

        if (response.ok) {
          await db.mutations.bulkDelete(pendingMutations.map((m: any) => m.id));
        } else {
          canPullRemoteChanges = false;
          console.error('Failed to push mutations');
        }
      }

      if (!canPullRemoteChanges) {
        return;
      }

      // 2. Pull updates
      const storedLastSync = parseInt(localStorage.getItem('lastSync') || '0');
      const needsFullResync = (territoryCount === 0 && apartmentCount === 0) || Number.isNaN(storedLastSync);
      const lastSync = needsFullResync ? 0 : storedLastSync;
      const pullResponse = await fetch(`/api/sync?lastSync=${lastSync}`);
      if (pullResponse.ok) {
        const { territories, apartments, deletedTerritories, timestamp } = await pullResponse.json();
        const deletedTerritoryIds = (deletedTerritories || []).map((territory: any) => territory.id);

        await db.transaction('rw', db.territories, db.apartments, async () => {
          if (needsFullResync) {
            await db.territories.clear();
            await db.apartments.clear();
          }

          if (deletedTerritoryIds.length > 0) {
            await db.territories.bulkDelete(deletedTerritoryIds);
            await db.apartments.where('territoryId').anyOf(deletedTerritoryIds).delete();
          }

          if (territories.length > 0) {
            // Filter out deleted territories if we were sending them (though sync usually sends current state)
            // But here we are just putting what server sends.
            // If server sends all territories, we might want to clear local first or handle deletions differently.
            // For now, let's assume server sends all valid territories created after lastSync.
            // If we want full sync, we might need a different strategy.
            // But for "offline-first" usually we just upsert.
            
            await db.territories.bulkPut(territories.map((t: any) => ({
              id: t.id,
              name: t.name,
              imageUrl: t.image_url,
              mapLink: t.map_link,
              startNumber: t.start_number || 1,
              endNumber: t.end_number || t.apartment_count,
              createdAt: t.created_at,
              updatedAt: t.updated_at || t.created_at
            })));
          }
          if (apartments.length > 0) {
            await db.apartments.bulkPut(apartments.map((a: any) => {
                let parsedComments = [];
                try {
                    parsedComments = JSON.parse(a.comments || '[]');
                } catch (e) {
                    // Handle legacy string comments if any
                    if (a.comments && typeof a.comments === 'string' && !a.comments.startsWith('[')) {
                         parsedComments = [{ id: 'legacy', text: a.comments, timestamp: a.updated_at }];
                    }
                }
                
                return {
                  id: a.id,
                  territoryId: a.territory_id,
                  number: a.number,
                  status: a.status,
                  noIntercom: !!a.no_intercom,
                  noBell: !!a.no_bell,
                  comments: parsedComments,
                  updatedAt: a.updated_at
                };
            }));
          }
        });

        localStorage.setItem('lastSync', timestamp.toString());
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  syncRef.current = sync;

  // Auto-sync when coming online or when mutations are added
  useEffect(() => {
    if (isOnline) {
      void sync();
    }
  }, [isOnline, mutations?.length]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncRef.current();
    }, FALLBACK_SYNC_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const eventSource = new EventSource('/api/events');

    const handleSyncEvent = () => {
      void syncRef.current();
    };

    eventSource.addEventListener('sync', handleSyncEvent);

    return () => {
      eventSource.removeEventListener('sync', handleSyncEvent);
      eventSource.close();
    };
  }, [isOnline]);

  useEffect(() => {
    const handleFocus = () => {
      if (navigator.onLine) {
        void sync();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void sync();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOnline]);

  return { isOnline, isSyncing, sync };
}
