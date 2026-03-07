import Dexie, { Table } from 'dexie';

export interface Territory {
  id: string;
  name: string;
  imageUrl: string;
  mapLink: string;
  startNumber: number;
  endNumber: number;
  createdAt: number;
}

export interface Comment {
  id: string;
  text: string;
  timestamp: number;
}

export interface Apartment {
  id: string; // `${territoryId}-${number}`
  territoryId: string;
  number: number;
  status: 'default' | 'success' | 'refusal';
  noIntercom: boolean;
  noBell: boolean;
  comments: Comment[]; // Changed from string to array of objects
  updatedAt: number;
}

export interface Mutation {
  id?: number;
  type: 'territory' | 'apartment';
  data: any;
  timestamp: number;
}

export class MyDatabase extends Dexie {
  territories!: Table<Territory>;
  apartments!: Table<Apartment>;
  mutations!: Table<Mutation>;

  constructor() {
    super('TerritoryManagerDB');
    this.version(1).stores({
      territories: 'id, createdAt',
      apartments: 'id, territoryId, updatedAt',
      mutations: '++id, timestamp'
    });
    this.version(2).stores({
      territories: 'id, createdAt',
      apartments: 'id, territoryId, updatedAt',
      mutations: '++id, timestamp'
    }).upgrade(tx => {
      // Migration logic if needed, but for new fields defaults are usually fine in JS
      // We might need to migrate old data if we want to preserve it, 
      // but since we are changing the structure significantly (start/end vs count), 
      // we'll assume new territories follow new structure.
    });
  }
}

export const db = new MyDatabase();
