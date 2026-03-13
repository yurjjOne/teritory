export interface GroupAccessConfig {
  id: string;
  label: string;
  password: string;
}

export interface GroupAccessSession {
  groupId: string;
  groupLabel: string;
}

export interface AdminAccessConfig {
  id: string;
  label: string;
  password: string;
}

const GROUP_SESSION_STORAGE_KEY = 'territory-manager.group-session';

export const GROUP_ACCESS_CONFIGS: GroupAccessConfig[] = [
  {
    id: 'default-group',
    label: 'Основна група',
    password: '333',
  },
];

export const ADMIN_ACCESS_CONFIGS: AdminAccessConfig[] = [
  {
    id: 'default-admin',
    label: 'Адміністратор',
    password: 'admin123',
  },
];

export function authenticateGroup(password: string): GroupAccessSession | null {
  const match = GROUP_ACCESS_CONFIGS.find((config) => config.password === password.trim());

  if (!match) {
    return null;
  }

  return {
    groupId: match.id,
    groupLabel: match.label,
  };
}

export function authenticateAdmin(password: string): boolean {
  return ADMIN_ACCESS_CONFIGS.some((config) => config.password === password.trim());
}

export function loadGroupAccessSession(): GroupAccessSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(GROUP_SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<GroupAccessSession>;
    if (!parsed.groupId || !parsed.groupLabel) {
      return null;
    }

    return {
      groupId: parsed.groupId,
      groupLabel: parsed.groupLabel,
    };
  } catch {
    return null;
  }
}

export function saveGroupAccessSession(session: GroupAccessSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(GROUP_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearGroupAccessSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(GROUP_SESSION_STORAGE_KEY);
}
