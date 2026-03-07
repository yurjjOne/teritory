import { useEffect, useState } from 'react';
import { db, Mutation } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export function useSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
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
    if (!isOnline || isSyncing) return;

    setIsSyncing(true);
    try {
      // 1. Push mutations
      const pendingMutations = await db.mutations.toArray();
      if (pendingMutations.length > 0) {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mutations: pendingMutations }),
        });

        if (response.ok) {
          await db.mutations.bulkDelete(pendingMutations.map((m: any) => m.id));
        } else {
          console.error('Failed to push mutations');
        }
      }

      // 2. Pull updates
      const lastSync = parseInt(localStorage.getItem('lastSync') || '0');
      const pullResponse = await fetch(`/api/sync?lastSync=${lastSync}`);
      if (pullResponse.ok) {
        const { territories, apartments, timestamp } = await pullResponse.json();

        await db.transaction('rw', db.territories, db.apartments, async () => {
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
              createdAt: t.created_at
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
      setIsSyncing(false);
    }
  };

  // Auto-sync when coming online or when mutations are added
  useEffect(() => {
    if (isOnline) {
      sync();
    }
  }, [isOnline, mutations?.length]);

  return { isOnline, isSyncing, sync };
}
