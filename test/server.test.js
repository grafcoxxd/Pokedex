import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDatabase } from '../src/binder.js';

test('Webserver liefert und speichert gleichzeitige Änderungen zuverlässig', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pokemon-web-'));
  const path = join(dir, 'collection.json');
  const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, BINDER_DB: path, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Server beendet: ${code} ${errors}`)));
      child.stdout.on('data', (chunk) => {
        const match = String(chunk).match(/127\.0\.0\.1:(\d+)/);
        if (match) resolve(match[1]);
      });
    });
    const url = `http://127.0.0.1:${port}`;
    assert.match(await (await fetch(url)).text(), /Pokédex<\/small>/);
    for (const region of ['kanto', 'johto', 'hoenn', 'sinnoh']) {
      const response = await fetch(`${url}/region-maps/${region}.png`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),
        await readFile(new URL(`../public/region-maps/${region}.png`, import.meta.url)));
    }
    const initial = await (await fetch(`${url}/api/binders`)).json();
    assert.equal(initial.capacity, 360);
    assert.equal(initial.binders.length, 4);
    const unknownPokemon = await fetch(`${url}/api/pokedex/999999`);
    assert.equal(unknownPokemon.status, 404);
    const missingSet = await fetch(`${url}/api/card-search?number=041%2F081&language=ko`);
    assert.equal(missingSet.status, 400);
    assert.match((await missingSet.json()).error, /Setnamen/);
    const post = (number) => fetch(`${url}/api/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dex: 133, set: 'Testset', number, cardLanguage: 'ko' }),
    });
    const responses = await Promise.all([post('1'), post('2'), post('3')]);
    assert.deepEqual(responses.map((response) => response.status), [201, 201, 201]);
    const cards = (await loadDatabase(path)).cards;
    assert.equal(cards.length, 3);
    assert.equal(cards[0].cardLanguage, 'ko');
    const invalidLanguage = await fetch(`${url}/api/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dex: 133, set: 'Test', number: '4', cardLanguage: 'invalid' }),
    });
    assert.equal(invalidLanguage.status, 400);
    assert.equal((await loadDatabase(path)).cards.length, 3);
    const bad = await fetch(`${url}/api/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    });
    assert.equal(bad.status, 400);
    const rejected = await fetch(`${url}/api/cards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({ dex: 133, set: 'Test', number: '4' }),
    });
    assert.equal(rejected.status, 403);
    assert.equal((await fetch(`${url}/api/cards/${cards[0].id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await loadDatabase(path)).cards.length, 2);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
