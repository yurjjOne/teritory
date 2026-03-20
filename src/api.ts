import { Apartment, Comment, Territory } from './db';

interface CreateTerritoryInput {
  id: string;
  name: string;
  imageUrl: string;
  mapLink: string;
  startNumber: number;
  endNumber: number;
}

interface UpdateApartmentInput {
  status: Apartment['status'];
  noIntercom: boolean;
  noBell: boolean;
  comments: Comment[];
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    let message = 'Помилка сервера';

    try {
      const payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parsing errors for non-JSON responses.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function fetchTerritories(): Promise<Territory[]> {
  const payload = await requestJson<{ territories: Territory[] }>('/api/territories');
  return payload.territories;
}

export async function createTerritory(input: CreateTerritoryInput): Promise<Territory> {
  const payload = await requestJson<{ territory: Territory }>('/api/territories', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return payload.territory;
}

export async function deleteTerritory(id: string): Promise<void> {
  await requestJson<void>(`/api/territories/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchTerritoryDetail(id: string): Promise<{ territory: Territory; apartments: Apartment[] }> {
  return requestJson<{ territory: Territory; apartments: Apartment[] }>(`/api/territories/${id}`);
}

export async function updateApartment(id: string, input: UpdateApartmentInput): Promise<Apartment> {
  const payload = await requestJson<{ apartment: Apartment }>(`/api/apartments/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

  return payload.apartment;
}
