import { loadDatabase, saveDatabase, validate } from './binder.js';

function fileStore(path) {
  return {
    load: () => loadDatabase(path),
    save: (data) => saveDatabase(path, data),
    async initialize(seedPath) {
      try {
        await loadDatabase(path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await saveDatabase(path, await loadDatabase(seedPath), { create: true });
      }
    },
  };
}

async function postgresStore(url, pg) {
  const pool = new pg.Pool({ connectionString: url, max: 3 });
  await pool.query('CREATE TABLE IF NOT EXISTS collection (id integer PRIMARY KEY, data jsonb NOT NULL)');
  return {
    async load() {
      const { rows } = await pool.query('SELECT data FROM collection WHERE id = 1');
      if (!rows.length) throw Object.assign(new Error('Keine Sammlung gespeichert.'), { code: 'ENOENT' });
      return validate(rows[0].data);
    },
    async save(data) {
      validate(data);
      await pool.query(
        'INSERT INTO collection (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data',
        [JSON.stringify(data)],
      );
    },
    async initialize(seedPath, localPath) {
      const { rows } = await pool.query('SELECT 1 FROM collection WHERE id = 1');
      if (rows.length) return;
      let initial;
      try {
        initial = await loadDatabase(localPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        initial = await loadDatabase(seedPath);
      }
      await this.save(initial);
    },
  };
}

export async function createStore(databasePath, databaseUrl = process.env.DATABASE_URL, pg) {
  if (!databaseUrl) return fileStore(databasePath);
  return postgresStore(databaseUrl, pg || (await import('pg')).default);
}
