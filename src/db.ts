import Dexie, { Table } from 'dexie';

export interface Territory {
  id: string;
  name: string;
  imageUrl: string;
  mapLink: string;
  startNumber: number;
  endNumber: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Comment {
  id: string;
  text: string;
  timestamp: number;
}

export interface Apartment {
  id: string;
  territoryId: string;
  number: number;
  status: 'default' | 'success' | 'refusal';
  noIntercom: boolean;
  noBell: boolean;
  comments: Comment[];
  updatedAt: number;
}

export interface PendingApartmentMutation {
  id: string;
  type: 'apartment';
  apartmentId: string;
  territoryId: string;
  payload: {
    status: Apartment['status'];
    noIntercom: boolean;
    noBell: boolean;
    comments: Comment[];
  };
  createdAt: number;
  updatedAt: number;
}

class TerritoryManagerOfflineDB extends Dexie {
  territories!: Table<Territory, string>;
  apartments!: Table<Apartment, string>;
  pendingMutations!: Table<PendingApartmentMutation, string>;

  constructor() {
    super('TerritoryManagerOfflineDB');

    this.version(1).stores({
      territories: 'id, createdAt, updatedAt',
      apartments: 'id, territoryId, number, updatedAt',
      pendingMutations: 'id, apartmentId, territoryId, updatedAt',
    });
  }
}

export const db = new TerritoryManagerOfflineDB();
