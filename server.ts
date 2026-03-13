import express from 'express';
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

// Get all data (for initial sync)
app.get('/api/sync', (req, res) => {
  const lastSync = parseInt(req.query.lastSync as string) || 0;
  
  const territories = db.prepare('SELECT * FROM territories WHERE updated_at > ?').all(lastSync);
  const apartments = db.prepare('SELECT * FROM apartments WHERE updated_at > ?').all(lastSync);
  const deletedTerritories = db.prepare('SELECT id, deleted_at FROM deleted_territories WHERE deleted_at > ?').all(lastSync);
  
  res.json({ territories, apartments, deletedTerritories, timestamp: Date.now() });
});

// Push mutations
app.post('/api/sync', (req, res) => {
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
    res.json({ success: true, timestamp: Date.now() });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});


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
