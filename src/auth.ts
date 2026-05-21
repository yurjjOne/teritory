export interface GroupSummary {
  id: string;
  label: string;
}

export type AuthSession =
  | {
      role: 'admin';
      label: string;
    }
  | {
      role: 'group';
      label: string;
      groupId: string;
      groupLabel: string;
    };

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
      // Ignore invalid JSON error payloads.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function loginWithPassword(password: string): Promise<AuthSession> {
  const payload = await requestJson<{ session: AuthSession }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

  return payload.session;
}

export async function fetchAuthSession(): Promise<AuthSession | null> {
  const payload = await requestJson<{ session: AuthSession | null }>('/api/auth/session');
  return payload.session;
}

export async function logout(): Promise<void> {
  await requestJson<void>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchGroups(): Promise<GroupSummary[]> {
  const payload = await requestJson<{ groups: GroupSummary[] }>('/api/groups');
  return payload.groups;
}

export async function updateGroupPassword(groupId: string, password: string): Promise<void> {
  await requestJson<void>(`/api/groups/${groupId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password }),
  });
}

export function getGroupLabel(groupId: string) {
  const match = groupId.match(/group-(\d+)/i);
  if (!match) {
    return 'Група';
  }

  return `Група ${match[1]}`;
}
