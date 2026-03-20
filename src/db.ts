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
