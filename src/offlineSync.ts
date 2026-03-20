import { fetchTerritories, fetchTerritoryDetail, updateApartment } from './api';
import { Apartment, db, Territory } from './db';

function buildApartmentMutationId(apartmentId: string) {
  return `apartment:${apartmentId}`;
}

export async function cacheTerritoriesFromServer(): Promise<Territory[]> {
  const territories = await fetchTerritories();
  const nextTerritoryIds = new Set(territories.map((territory) => territory.id));

  await db.transaction('rw', db.territories, db.apartments, async () => {
    const cachedTerritoryIds = (await db.territories.toCollection().primaryKeys()) as string[];
    const removedTerritoryIds = cachedTerritoryIds.filter((territoryId) => !nextTerritoryIds.has(territoryId));

    if (territories.length > 0) {
      await db.territories.bulkPut(territories);
    }

    if (removedTerritoryIds.length > 0) {
      await db.territories.bulkDelete(removedTerritoryIds);
      await Promise.all(
        removedTerritoryIds.map((territoryId) => db.apartments.where('territoryId').equals(territoryId).delete())
      );
    }
  });

  return territories;
}

export async function cacheTerritoryDetailFromServer(territoryId: string): Promise<void> {
  const payload = await fetchTerritoryDetail(territoryId);
  const pendingApartmentIds = await db.pendingMutations.where('territoryId').equals(territoryId).primaryKeys();
  const cachedPendingApartments = pendingApartmentIds.length
    ? ((await db.apartments.bulkGet(pendingApartmentIds as string[])).filter(Boolean) as Apartment[])
    : [];

  await db.transaction('rw', db.territories, db.apartments, async () => {
    await db.territories.put(payload.territory);
    await db.apartments.where('territoryId').equals(territoryId).delete();

    if (payload.apartments.length > 0) {
      await db.apartments.bulkPut(payload.apartments);
    }

    if (cachedPendingApartments.length > 0) {
      await db.apartments.bulkPut(cachedPendingApartments);
    }
  });
}

export async function saveApartmentLocally(apartment: Apartment): Promise<void> {
  const mutationId = buildApartmentMutationId(apartment.id);
  const now = Date.now();

  await db.transaction('rw', db.apartments, db.pendingMutations, async () => {
    await db.apartments.put({
      ...apartment,
      updatedAt: now,
    });

    await db.pendingMutations.put({
      id: mutationId,
      type: 'apartment',
      apartmentId: apartment.id,
      territoryId: apartment.territoryId,
      payload: {
        status: apartment.status,
        noIntercom: apartment.noIntercom,
        noBell: apartment.noBell,
        comments: apartment.comments,
      },
      createdAt: now,
      updatedAt: now,
    });
  });
}

export async function flushPendingMutations(): Promise<{ flushedCount: number; pendingCount: number }> {
  const mutations = await db.pendingMutations.orderBy('updatedAt').toArray();
  let flushedCount = 0;

  for (const mutation of mutations) {
    try {
      const updatedApartment = await updateApartment(mutation.apartmentId, mutation.payload);

      await db.transaction('rw', db.apartments, db.pendingMutations, async () => {
        await db.apartments.put(updatedApartment);
        await db.pendingMutations.delete(mutation.id);
      });

      flushedCount += 1;
    } catch (error) {
      console.error('Flush mutation error:', error);
      break;
    }
  }

  return {
    flushedCount,
    pendingCount: await db.pendingMutations.count(),
  };
}
