import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { addCard } from '../src/binder.js';
import { createStore } from '../src/storage.js';

const seedPath = fileURLToPath(new URL('../data/seed.json', import.meta.url));

test('Postgres-Speicher legt Startdaten an und behält Änderungen', async () => {
  const pg = newDb({ noAstCoverageCheck: true }).adapters.createPg();
  const store = await createStore('fehlt.json', 'postgres://test', pg);
  await store.initialize(seedPath, 'gibt-es-nicht.json');
  const data = await store.load();
  addCard(data, 133, 'Basis', '1', 'de');
  await store.save(data);

  const reopened = await createStore('fehlt.json', 'postgres://test', pg);
  await reopened.initialize(seedPath, 'gibt-es-nicht.json');
  assert.equal((await reopened.load()).cards.length, 1);
});
