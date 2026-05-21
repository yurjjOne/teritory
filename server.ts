import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { createHmac, randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;
const configuredDbPath = process.env.DB_PATH;
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(process.cwd(), 'db', 'territories.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
const SESSION_COOKIE_NAME = 'territory_manager_session';
const ADMIN_LABEL = 'Адміністратор';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }

  throw new Error(`${name} environment variable is required`);
}

const SESSION_SECRET = getRequiredEnv('SESSION_SECRET');
const ADMIN_PASSWORD = getRequiredEnv('ADMIN_PASSWORD');

const GROUP_DEFAULTS = Array.from({ length: 9 }, (_, index) => {
  const groupNumber = index + 1;
  const password = String(groupNumber).repeat(3);

  return {
    id: `group-${groupNumber}`,
    label: `Група ${groupNumber}`,
    password,
  };
});

type SessionPayload =
  | {
      role: 'admin';
      issuedAt: number;
    }
  | {
      role: 'group';
      groupId: string;
      issuedAt: number;
    };

type AuthSession =
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

type TerritoryRow = {
  id: string;
  name: string;
  image_url: string | null;
  map_link: string | null;
  start_number: number | null;
  end_number: number | null;
  apartment_count: number | null;
  created_at: number;
  updated_at: number;
  group_id: string | null;
};

type ApartmentRow = {
  id: string;
  territory_id: string;
  number: number;
  status: 'default' | 'success' | 'refusal';
  no_intercom: number;
  no_bell: number;
  comments: string | null;
  updated_at: number;
};

type GroupRow = {
  id: string;
  label: string;
  password_hash: string;
};

const sseClients = new Map<Response, AuthSession>();

function hashPassword(password: string) {
  return createHmac('sha256', 'territory-manager-password-hash').update(password).digest('hex');
}

function signSession(payload: SessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySession(value: string | undefined): SessionPayload | null {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.role === 'admin') {
      return payload;
    }

    if (payload.role === 'group' && payload.groupId) {
      return payload;
    }

    return null;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    cookies.set(key, decodeURIComponent(value));
  }

  return cookies;
}

function shouldUseSecureCookies(req: Request) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function serializeCookie(name: string, value: string, req: Request) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${60 * 60 * 24 * 30}`];

  if (shouldUseSecureCookies(req)) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function serializeClearedCookie(name: string, req: Request) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];

  if (shouldUseSecureCookies(req)) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function getGroupById(groupId: string) {
  return db.prepare('SELECT id, label, password_hash FROM groups WHERE id = ?').get(groupId) as GroupRow | undefined;
}

function buildSession(payload: SessionPayload): AuthSession | null {
  if (payload.role === 'admin') {
    return {
      role: 'admin',
      label: ADMIN_LABEL,
    };
  }

  const group = getGroupById(payload.groupId);
  if (!group) {
    return null;
  }

  return {
    role: 'group',
    label: group.label,
    groupId: group.id,
    groupLabel: group.label,
  };
}

function getAuthSession(req: Request) {
  const cookies = parseCookies(req.headers.cookie);
  const payload = verifySession(cookies.get(SESSION_COOKIE_NAME));

  if (!payload) {
    return null;
  }

  return buildSession(payload);
}

function requireSession(req: Request, res: Response) {
  const session = getAuthSession(req);
  if (!session) {
    res.status(401).json({ error: 'Потрібно увійти в систему' });
    return null;
  }

  return session;
}

function requireAdminSession(req: Request, res: Response) {
  const session = requireSession(req, res);
  if (!session) {
    return null;
  }

  if (session.role !== 'admin') {
    res.status(403).json({ error: 'Доступно лише адміністратору' });
    return null;
  }

  return session;
}

function writeSseEvent(response: Response, event: string, payload: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSyncEvent(groupId: string) {
  if (sseClients.size === 0) {
    return;
  }

  const payload = {
    type: 'sync-needed',
    groupId,
    timestamp: Date.now(),
  };

  for (const [response, session] of sseClients.entries()) {
    if (session.role === 'admin' || session.groupId === groupId) {
      writeSseEvent(response, 'sync', payload);
    }
  }
}

function parseComments(rawValue: string | null) {
  try {
    return JSON.parse(rawValue || '[]');
  } catch {
    return [];
  }
}

function serializeTerritory(row: TerritoryRow) {
  return {
    id: row.id,
    groupId: row.group_id || 'group-3',
    name: row.name,
    imageUrl: row.image_url || '',
    mapLink: row.map_link || '',
    startNumber: row.start_number || 1,
    endNumber: row.end_number || row.apartment_count || row.start_number || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeApartment(row: ApartmentRow) {
  return {
    id: row.id,
    territoryId: row.territory_id,
    number: row.number,
    status: row.status,
    noIntercom: !!row.no_intercom,
    noBell: !!row.no_bell,
    comments: parseComments(row.comments),
    updatedAt: row.updated_at,
  };
}

function getGroupScopedTerritory(territoryId: string, session: AuthSession) {
  const territory = db.prepare('SELECT * FROM territories WHERE id = ?').get(territoryId) as TerritoryRow | undefined;

  if (!territory) {
    return null;
  }

  if (session.role === 'group' && territory.group_id !== session.groupId) {
    return null;
  }

  return territory;
}

function getGroupScopedApartment(apartmentId: string, session: AuthSession) {
  const apartment = db
    .prepare(`
      SELECT apartments.*, territories.group_id
      FROM apartments
      INNER JOIN territories ON territories.id = apartments.territory_id
      WHERE apartments.id = ?
    `)
    .get(apartmentId) as (ApartmentRow & { group_id: string }) | undefined;

  if (!apartment) {
    return null;
  }

  if (session.role === 'group' && apartment.group_id !== session.groupId) {
    return null;
  }

  return apartment;
}

function getVisibleGroupId(req: Request, session: AuthSession) {
  if (session.role === 'group') {
    return session.groupId;
  }

  const requestedGroupId = String(req.query.groupId || '').trim();
  return requestedGroupId || null;
}

app.set('trust proxy', 1);

// Initialize DB
try {
  db.pragma('journal_mode = WAL');
} catch {
  // Ignore WAL mode issues on platforms that do not support it.
}

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS territories (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    name TEXT NOT NULL,
    image_url TEXT,
    map_link TEXT,
    start_number INTEGER,
    end_number INTEGER,
    apartment_count INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS apartments (
    id TEXT PRIMARY KEY,
    territory_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    status TEXT DEFAULT 'default',
    no_intercom INTEGER DEFAULT 0,
    no_bell INTEGER DEFAULT 0,
    comments TEXT DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(territory_id) REFERENCES territories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deleted_territories (
    id TEXT PRIMARY KEY,
    deleted_at INTEGER NOT NULL
  );
`);

try {
  db.exec('ALTER TABLE territories ADD COLUMN group_id TEXT');
} catch {}
try {
  db.exec('ALTER TABLE territories ADD COLUMN start_number INTEGER');
} catch {}
try {
  db.exec('ALTER TABLE territories ADD COLUMN end_number INTEGER');
} catch {}
try {
  db.exec('ALTER TABLE territories ADD COLUMN updated_at INTEGER');
} catch {}
try {
  db.exec('ALTER TABLE apartments ADD COLUMN no_intercom INTEGER DEFAULT 0');
} catch {}
try {
  db.exec('ALTER TABLE apartments ADD COLUMN no_bell INTEGER DEFAULT 0');
} catch {}

db.exec(`
  UPDATE territories
  SET updated_at = created_at
  WHERE updated_at IS NULL
`);

db.exec(`
  UPDATE territories
  SET group_id = 'group-3'
  WHERE group_id IS NULL OR TRIM(group_id) = ''
`);

const now = Date.now();
const insertGroup = db.prepare(`
  INSERT OR IGNORE INTO groups (id, label, password_hash, created_at, updated_at)
  VALUES (@id, @label, @password_hash, @created_at, @updated_at)
`);
const updateGroupLabel = db.prepare(`
  UPDATE groups
  SET label = @label
  WHERE id = @id
`);

for (const group of GROUP_DEFAULTS) {
  insertGroup.run({
    id: group.id,
    label: group.label,
    password_hash: hashPassword(group.password),
    created_at: now,
    updated_at: now,
  });
  updateGroupLabel.run({ id: group.id, label: group.label });
}

app.use(express.json());

app.post('/api/auth/login', (req, res) => {
  const password = String(req.body?.password || '').trim();

  if (!password) {
    return res.status(400).json({ error: 'Введіть пароль' });
  }

  let payload: SessionPayload | null = null;
  let session: AuthSession | null = null;

  if (password === ADMIN_PASSWORD) {
    payload = {
      role: 'admin',
      issuedAt: Date.now(),
    };
    session = buildSession(payload);
  } else {
    const group = db
      .prepare('SELECT id, label, password_hash FROM groups WHERE password_hash = ?')
      .get(hashPassword(password)) as GroupRow | undefined;

    if (group) {
      payload = {
        role: 'group',
        groupId: group.id,
        issuedAt: Date.now(),
      };
      session = buildSession(payload);
    }
  }

  if (!payload || !session) {
    return res.status(401).json({ error: 'Невірний пароль' });
  }

  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, signSession(payload), req));
  return res.json({ session });
});

app.get('/api/auth/session', (req, res) => {
  const session = getAuthSession(req);
  res.json({ session });
});

app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', serializeClearedCookie(SESSION_COOKIE_NAME, req));
  res.status(204).send();
});

app.get('/api/groups', (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return;
  }

  const groups = db
    .prepare('SELECT id, label FROM groups ORDER BY id ASC')
    .all() as Array<{ id: string; label: string }>;

  res.json({ groups });
});

app.patch('/api/groups/:id/password', (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return;
  }

  const groupId = req.params.id;
  const newPassword = String(req.body?.password || '').trim();

  if (newPassword.length < 3) {
    return res.status(400).json({ error: 'Пароль групи має містити щонайменше 3 символи' });
  }

  const group = getGroupById(groupId);
  if (!group) {
    return res.status(404).json({ error: 'Групу не знайдено' });
  }

  db.prepare(`
    UPDATE groups
    SET password_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(hashPassword(newPassword), Date.now(), groupId);

  res.json({ group: { id: group.id, label: group.label } });
});

app.get('/api/events', (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.set(res, session);
  writeSseEvent(res, 'connected', { timestamp: Date.now(), role: session.role });

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/territories', (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const visibleGroupId = getVisibleGroupId(req, session);
  if (!visibleGroupId) {
    return res.status(400).json({ error: 'Потрібно вибрати групу' });
  }

  const group = getGroupById(visibleGroupId);
  if (!group) {
    return res.status(404).json({ error: 'Групу не знайдено' });
  }

  const territories = db
    .prepare('SELECT * FROM territories WHERE group_id = ? ORDER BY created_at DESC')
    .all(visibleGroupId) as TerritoryRow[];

  res.json({ territories: territories.map(serializeTerritory) });
});

app.post('/api/territories', (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return;
  }

  const id = String(req.body?.id || randomUUID()).trim();
  const groupId = String(req.body?.groupId || '').trim();
  const name = String(req.body?.name || '').trim();
  const imageUrl = String(req.body?.imageUrl || '').trim();
  const mapLink = String(req.body?.mapLink || '').trim();
  const startNumber = Number(req.body?.startNumber);
  const endNumber = Number(req.body?.endNumber);

  if (!groupId || !getGroupById(groupId)) {
    return res.status(400).json({ error: 'Оберіть коректну групу' });
  }

  if (!id || !name || !Number.isInteger(startNumber) || !Number.isInteger(endNumber) || endNumber < startNumber) {
    return res.status(400).json({ error: 'Некоректні дані території' });
  }

  const existingTerritory = db.prepare('SELECT id FROM territories WHERE id = ?').get(id);
  if (existingTerritory) {
    return res.status(409).json({ error: 'Територія з таким ідентифікатором уже існує' });
  }

  const timestamp = Date.now();
  const insertTerritory = db.prepare(`
    INSERT INTO territories (id, group_id, name, image_url, map_link, start_number, end_number, apartment_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertApartment = db.prepare(`
    INSERT INTO apartments (id, territory_id, number, status, no_intercom, no_bell, comments, updated_at)
    VALUES (?, ?, ?, 'default', 0, 0, '[]', ?)
  `);
  const clearDeletedTerritory = db.prepare('DELETE FROM deleted_territories WHERE id = ?');

  const transaction = db.transaction(() => {
    insertTerritory.run(
      id,
      groupId,
      name,
      imageUrl,
      mapLink,
      startNumber,
      endNumber,
      endNumber - startNumber + 1,
      timestamp,
      timestamp
    );

    for (let apartmentNumber = startNumber; apartmentNumber <= endNumber; apartmentNumber += 1) {
      insertApartment.run(`${id}-${apartmentNumber}`, id, apartmentNumber, timestamp);
    }

    clearDeletedTerritory.run(id);
  });

  try {
    transaction();
    const territoryRow = db.prepare('SELECT * FROM territories WHERE id = ?').get(id) as TerritoryRow;
    broadcastSyncEvent(groupId);
    return res.status(201).json({ territory: serializeTerritory(territoryRow) });
  } catch (error) {
    console.error('Create territory error:', error);
    return res.status(500).json({ error: 'Не вдалося створити територію' });
  }
});

app.delete('/api/territories/:id', (req, res) => {
  const session = requireAdminSession(req, res);
  if (!session) {
    return;
  }

  const territoryId = req.params.id;
  const existingTerritory = db.prepare('SELECT * FROM territories WHERE id = ?').get(territoryId) as TerritoryRow | undefined;

  if (!existingTerritory) {
    return res.status(404).json({ error: 'Територію не знайдено' });
  }

  const deleteTerritory = db.prepare('DELETE FROM territories WHERE id = ?');
  const deleteApartments = db.prepare('DELETE FROM apartments WHERE territory_id = ?');
  const upsertDeletedTerritory = db.prepare(`
    INSERT OR REPLACE INTO deleted_territories (id, deleted_at)
    VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    deleteApartments.run(territoryId);
    deleteTerritory.run(territoryId);
    upsertDeletedTerritory.run(territoryId, Date.now());
  });

  try {
    transaction();
    broadcastSyncEvent(existingTerritory.group_id || 'group-3');
    return res.status(204).send();
  } catch (error) {
    console.error('Delete territory error:', error);
    return res.status(500).json({ error: 'Не вдалося видалити територію' });
  }
});

app.get('/api/territories/:id', (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const territory = getGroupScopedTerritory(req.params.id, session);
  if (!territory) {
    return res.status(404).json({ error: 'Територію не знайдено' });
  }

  const apartments = db
    .prepare('SELECT * FROM apartments WHERE territory_id = ? ORDER BY number ASC')
    .all(territory.id) as ApartmentRow[];

  return res.json({
    territory: serializeTerritory(territory),
    apartments: apartments.map(serializeApartment),
  });
});

app.put('/api/apartments/:id', (req, res) => {
  const session = requireSession(req, res);
  if (!session) {
    return;
  }

  const apartment = getGroupScopedApartment(req.params.id, session);
  if (!apartment) {
    return res.status(404).json({ error: 'Квартиру не знайдено' });
  }

  const status = req.body?.status;
  const noIntercom = !!req.body?.noIntercom;
  const noBell = !!req.body?.noBell;
  const comments = Array.isArray(req.body?.comments) ? req.body.comments : [];

  if (!['default', 'success', 'refusal'].includes(status)) {
    return res.status(400).json({ error: 'Некоректний статус квартири' });
  }

  db.prepare(`
    UPDATE apartments
    SET status = ?, no_intercom = ?, no_bell = ?, comments = ?, updated_at = ?
    WHERE id = ?
  `).run(status, noIntercom ? 1 : 0, noBell ? 1 : 0, JSON.stringify(comments), Date.now(), req.params.id);

  const updatedApartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(req.params.id) as ApartmentRow;
  broadcastSyncEvent(apartment.group_id);

  return res.json({ apartment: serializeApartment(updatedApartment) });
});

app.all('/api/sync', (_req, res) => {
  return res.status(410).json({
    error: 'Клієнт оновлено. Перезавантажте сторінку, щоб перейти на актуальну версію.',
  });
});

app.all('/api/sync-legacy', (_req, res) => {
  return res.status(410).json({
    error: 'Стара схема синхронізації вимкнена.',
  });
});

setInterval(() => {
  for (const client of sseClients.keys()) {
    client.write(': keepalive\n\n');
  }
}, 30000);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
