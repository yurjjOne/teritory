import express, { Response } from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
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
const sseClients = new Set<Response>();

function writeSseEvent(response: Response, event: string, payload: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastSyncEvent(reason: 'mutation' | 'heartbeat' = 'mutation') {
  if (sseClients.size === 0) {
    return;
  }

  const payload = {
    type: 'sync-needed',
    reason,
    timestamp: Date.now(),
  };

  for (const client of sseClients) {
    writeSseEvent(client, 'sync', payload);
  }
}

function parseComments(rawValue: string | null) {
  try {
    return JSON.parse(rawValue || '[]');
  } catch {
    return [];
  }
}

function serializeTerritory(row: any) {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url || '',
    mapLink: row.map_link || '',
    startNumber: row.start_number || 1,
    endNumber: row.end_number || row.apartment_count || row.start_number || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeApartment(row: any) {
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

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS territories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT,
    map_link TEXT,
    start_number INTEGER,
    end_number INTEGER,
    apartment_count INTEGER, -- Keeping for backward compatibility or legacy
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
    comments TEXT DEFAULT '[]', -- JSON array of comments
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(territory_id) REFERENCES territories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS deleted_territories (
    id TEXT PRIMARY KEY,
    deleted_at INTEGER NOT NULL
  );
`);

// Try to add columns if they don't exist (for migration)
try {
  db.exec("ALTER TABLE territories ADD COLUMN start_number INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE territories ADD COLUMN end_number INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE territories ADD COLUMN updated_at INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE apartments ADD COLUMN no_intercom INTEGER DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE apartments ADD COLUMN no_bell INTEGER DEFAULT 0");
} catch (e) {}

db.exec(`
  UPDATE territories
  SET updated_at = created_at
  WHERE updated_at IS NULL
`);

app.use(express.json());

// API Routes

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);
  writeSseEvent(res, 'connected', { timestamp: Date.now() });

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.get('/api/territories', (req, res) => {
  const territories = db
    .prepare('SELECT * FROM territories ORDER BY created_at DESC')
    .all()
    .map(serializeTerritory);

  res.json({ territories });
});

app.post('/api/territories', (req, res) => {
  const id = String(req.body?.id || '').trim();
  const name = String(req.body?.name || '').trim();
  const imageUrl = String(req.body?.imageUrl || '').trim();
  const mapLink = String(req.body?.mapLink || '').trim();
  const startNumber = Number(req.body?.startNumber);
  const endNumber = Number(req.body?.endNumber);

  if (!id || !name || !Number.isInteger(startNumber) || !Number.isInteger(endNumber) || endNumber < startNumber) {
    return res.status(400).json({ error: 'Некоректні дані території' });
  }

  const existingTerritory = db.prepare('SELECT id FROM territories WHERE id = ?').get(id);
  if (existingTerritory) {
    return res.status(409).json({ error: 'Територія з таким ідентифікатором уже існує' });
  }

  const now = Date.now();
  const insertTerritory = db.prepare(`
    INSERT INTO territories (id, name, image_url, map_link, start_number, end_number, apartment_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertApartment = db.prepare(`
    INSERT INTO apartments (id, territory_id, number, status, no_intercom, no_bell, comments, updated_at)
    VALUES (?, ?, ?, 'default', 0, 0, '[]', ?)
  `);
  const clearDeletedTerritory = db.prepare('DELETE FROM deleted_territories WHERE id = ?');

  const transaction = db.transaction(() => {
    insertTerritory.run(
      id,
      name,
      imageUrl,
      mapLink,
      startNumber,
      endNumber,
      endNumber - startNumber + 1,
      now,
      now
    );

    for (let apartmentNumber = startNumber; apartmentNumber <= endNumber; apartmentNumber += 1) {
      insertApartment.run(`${id}-${apartmentNumber}`, id, apartmentNumber, now);
    }

    clearDeletedTerritory.run(id);
  });

  try {
    transaction();
    const territoryRow = db.prepare('SELECT * FROM territories WHERE id = ?').get(id);
    broadcastSyncEvent();
    return res.status(201).json({ territory: serializeTerritory(territoryRow) });
  } catch (error) {
    console.error('Create territory error:', error);
    return res.status(500).json({ error: 'Не вдалося створити територію' });
  }
});

app.delete('/api/territories/:id', (req, res) => {
  const territoryId = req.params.id;
  const existingTerritory = db.prepare('SELECT id FROM territories WHERE id = ?').get(territoryId);

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
    broadcastSyncEvent();
    return res.status(204).send();
  } catch (error) {
    console.error('Delete territory error:', error);
    return res.status(500).json({ error: 'Не вдалося видалити територію' });
  }
});

app.get('/api/territories/:id', (req, res) => {
  const territoryId = req.params.id;
  const territoryRow = db.prepare('SELECT * FROM territories WHERE id = ?').get(territoryId);

  if (!territoryRow) {
    return res.status(404).json({ error: 'Територію не знайдено' });
  }

  const apartmentRows = db
    .prepare('SELECT * FROM apartments WHERE territory_id = ? ORDER BY number ASC')
    .all(territoryId);

  return res.json({
    territory: serializeTerritory(territoryRow),
    apartments: apartmentRows.map(serializeApartment),
  });
});

app.put('/api/apartments/:id', (req, res) => {
  const apartmentId = req.params.id;
  const apartmentRow = db.prepare('SELECT * FROM apartments WHERE id = ?').get(apartmentId);

  if (!apartmentRow) {
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
  `).run(status, noIntercom ? 1 : 0, noBell ? 1 : 0, JSON.stringify(comments), Date.now(), apartmentId);

  const updatedApartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(apartmentId);
  broadcastSyncEvent();

  return res.json({ apartment: serializeApartment(updatedApartment) });
});

// Get all data (for initial sync)
app.all('/api/sync', (req, res) => {
  return res.status(410).json({
    error: 'Клієнт оновлено. Перезавантажте сторінку, щоб перейти на актуальну онлайн-версію.',
  });
});

app.get('/api/sync-legacy', (req, res) => {
  const lastSync = parseInt(req.query.lastSync as string) || 0;
  
  const territories = db.prepare('SELECT * FROM territories WHERE updated_at > ?').all(lastSync);
  const apartments = db.prepare('SELECT * FROM apartments WHERE updated_at > ?').all(lastSync);
  const deletedTerritories = db.prepare('SELECT id, deleted_at FROM deleted_territories WHERE deleted_at > ?').all(lastSync);
  
  res.json({ territories, apartments, deletedTerritories, timestamp: Date.now() });
});

// Push mutations
app.post('/api/sync-legacy', (req, res) => {
  const { mutations } = req.body;
  
  if (!mutations || !Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Invalid mutations format' });
  }

  const insertTerritory = db.prepare(`
    INSERT OR REPLACE INTO territories (id, name, image_url, map_link, start_number, end_number, apartment_count, created_at, updated_at)
    VALUES (@id, @name, @image_url, @map_link, @start_number, @end_number, @apartment_count, @created_at, @updated_at)
  `);

  const updateApartment = db.prepare(`
    INSERT OR REPLACE INTO apartments (id, territory_id, number, status, no_intercom, no_bell, comments, updated_at)
    VALUES (@id, @territory_id, @number, @status, @no_intercom, @no_bell, @comments, @updated_at)
  `);

  const deleteTerritory = db.prepare('DELETE FROM territories WHERE id = ?');
  const deleteApartments = db.prepare('DELETE FROM apartments WHERE territory_id = ?');
  const upsertDeletedTerritory = db.prepare(`
    INSERT OR REPLACE INTO deleted_territories (id, deleted_at)
    VALUES (?, ?)
  `);
  const clearDeletedTerritory = db.prepare('DELETE FROM deleted_territories WHERE id = ?');

  const transaction = db.transaction((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'territory') {
        if (mutation.data === null) {
          // ... deletion logic ...
        } else if (mutation.data._deleted) {
             const now = Date.now();
             deleteApartments.run(mutation.data.id);
             deleteTerritory.run(mutation.data.id);
             upsertDeletedTerritory.run(mutation.data.id, now);
        } else {
             const now = Date.now();
             const existingTerritory = db
               .prepare('SELECT created_at FROM territories WHERE id = ?')
               .get(mutation.data.id) as { created_at: number } | undefined;
             // Handle legacy data or missing fields
             const startNumber = mutation.data.startNumber || 1;
             // If endNumber is missing, try to use apartmentCount (legacy), otherwise default to startNumber
             const endNumber = mutation.data.endNumber || (mutation.data.apartmentCount ? mutation.data.apartmentCount + startNumber - 1 : startNumber);
             // Ensure apartment_count is calculated if missing
             const apartmentCount = mutation.data.apartmentCount || (endNumber - startNumber + 1);
             const createdAt = existingTerritory?.created_at ?? now;

             // Map camelCase to snake_case for DB
             const data = {
                ...mutation.data,
                start_number: startNumber,
                end_number: endNumber,
                apartment_count: apartmentCount,
                image_url: mutation.data.imageUrl,
                map_link: mutation.data.mapLink,
                created_at: createdAt,
                updated_at: now
            };
            insertTerritory.run(data);
            clearDeletedTerritory.run(mutation.data.id);
            
            // Initialize apartments
            const existingApts = db.prepare('SELECT count(*) as count FROM apartments WHERE territory_id = ?').get(mutation.data.id) as { count: number };
            if (existingApts.count === 0) {
                const insertApt = db.prepare(`
                    INSERT INTO apartments (id, territory_id, number, status, no_intercom, no_bell, comments, updated_at)
                    VALUES (?, ?, ?, 'default', 0, 0, '[]', ?)
                `);
                for (let i = startNumber; i <= endNumber; i++) {
                    insertApt.run(`${mutation.data.id}-${i}`, mutation.data.id, i, Date.now());
                }
            }
        }
      } else if (mutation.type === 'apartment') {
         const now = Date.now();
         const data = {
            ...mutation.data,
            territory_id: mutation.data.territoryId,
            updated_at: now,
            no_intercom: mutation.data.noIntercom ? 1 : 0,
            no_bell: mutation.data.noBell ? 1 : 0,
            comments: JSON.stringify(mutation.data.comments || [])
        };
        updateApartment.run(data);
      }
    }
  });

  try {
    transaction(mutations);
    broadcastSyncEvent();
    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

setInterval(() => {
  for (const client of sseClients) {
    client.write(': keepalive\n\n');
  }
}, 30000);


async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
