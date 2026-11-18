import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { addCard, BINDER_CAPACITY, loadDatabase, positions, removeCard, saveDatabase, search, validate } from '../src/binder.js';

const seedPath = fileURLToPath(new URL('../data/seed.json', import.meta.url));

test('Startdaten enthalten die komplette übermittelte Liste und passende Querverweise', async () => {
  const data = await loadDatabase(seedPath);
  assert.equal(data.binders.length, 4);
  assert.equal(data.binders.reduce((sum, binder) => sum + binder.entries.length, 0), 558);
  for (const [id, first, last] of [[1, 1, 151], [2, 152, 251], [3, 252, 386], [4, 387, 493]]) {
    const binder = data.binders.find((item) => item.id === id);
    for (let dex = first; dex <= last; dex++) {
      assert.equal(binder.entries.filter((entry) => entry.dex === dex).length, 1, `#${dex}`);
    }
  }
  assert.deepEqual(search(data, 475)[0].slots[0], { page: 4, slot: 6, card: null });
  assert.equal(search(data, 475)[0].homeBinder, 'Hoenn');
  assert.deepEqual(search(data, 475)[0].placeholders, [
    { binder: 'Sinnoh', page: 10, slot: 8, card: null },
  ]);
  assert.equal(search(data, 'FEELINARA')[0].homeBinder, 'Kanto');
  assert.equal(search(data, 'porygon-z')[0].dex, 474);
  assert.equal(search(data, '#025')[0].name, 'Pikachu');
  assert.equal(search(data, 'bisasam')[0].dex, 1);
});

test('Mehrere Karten verschieben nur nachfolgende Plätze im Heimat-Binder', async () => {
  const data = await loadDatabase(seedPath);
  const before = search(data, 134)[0].slots[0];
  const originalPlaceholder = search(data, 470)[0].placeholders[0];
  const originalOtherBinder = search(data, 152)[0].slots[0];
  for (let i = 0; i < 4; i++) addCard(data, 133, 'Testset', `${i + 1}/100`);
  const four = search(data, 133)[0];
  assert.equal(four.slots.length, 4);
  assert.deepEqual(four.slots.map((slot) => slot.card.number), ['1/100', '2/100', '3/100', '4/100']);
  assert.deepEqual(four.slots.map(({ page, slot }) => [page, slot]), [[18, 9], [19, 1], [19, 2], [19, 3]]);
  const relative = (slot) => (slot.page - 1) * 9 + slot.slot;
  assert.equal(relative(search(data, 134)[0].slots[0]), relative(before) + 3);
  const fifth = addCard(data, 133, 'Testset', '5/100');
  assert.equal(relative(search(data, 134)[0].slots[0]), relative(before) + 4);
  assert.equal(search(data, 133)[0].slots.length, 5);
  assert.deepEqual(search(data, 470)[0].placeholders[0], originalPlaceholder);
  assert.deepEqual(search(data, 152)[0].slots[0], originalOtherBinder);
  removeCard(data, fifth.id);
  assert.equal(relative(search(data, 134)[0].slots[0]), relative(before) + 3);
});

test('Guardevoir-Karten belegen das reservierte und danach unmittelbar folgende Fächer', async () => {
  const data = await loadDatabase(seedPath);
  const original = search(data, 282)[0].slots[0];
  const relative = (slot) => (slot.page - 1) * 9 + slot.slot;
  for (let i = 1; i <= 4; i++) addCard(data, 282, 'Set', `${i}/100`);
  const result = search(data, 282)[0];
  assert.equal(result.homeBinder, 'Hoenn');
  assert.deepEqual(result.slots.map(relative), [0, 1, 2, 3].map((n) => relative(original) + n));
  assert.deepEqual(result.slots.map((slot) => slot.card.number), ['1/100', '2/100', '3/100', '4/100']);
});

test('Neun Steckplätze je Seite, Platzhalter und leere Pokémon belegen je ein Fach', async () => {
  const data = await loadDatabase(seedPath);
  const binder = positions(data)[0];
  assert.deepEqual(binder.entries[0].slots[0], { page: 1, slot: 1, card: null });
  assert.deepEqual(binder.entries[8].slots[0], { page: 1, slot: 9, card: null });
  assert.deepEqual(binder.entries[9].slots[0], { page: 2, slot: 1, card: null });
  const placeholder = positions(data)[3].entries.find((entry) => entry.dex === 475);
  addCard(data, 475, 'Set A', '001');
  addCard(data, 475, 'Set A', '002');
  assert.equal(positions(data)[3].entries.find((entry) => entry.dex === 475).slots.length, 1);
  assert.deepEqual(positions(data)[3].entries.find((entry) => entry.dex === 475), placeholder);
});

test('Kapazität 360 zählt Reservierungen und erlaubt die erste Karte im reservierten Fach', async () => {
  const data = await loadDatabase(seedPath);
  const binder = positions(data)[0];
  const additional = BINDER_CAPACITY - binder.entries.length;
  for (let i = 0; i <= additional; i++) {
    data.cards.push({ id: `test-${i}`, dex: 133, set: 'Test', number: String(i) });
  }
  assert.equal(positions(data)[0].entries.reduce((sum, entry) => sum + entry.slots.length, 0), 360);
  assert.throws(() => addCard(data, 133, 'Test', 'extra'), /keine freien Fächer/);
  assert.doesNotThrow(() => addCard(data, 134, 'Test', 'erste'));
  assert.throws(() => addCard(data, 134, 'Test', 'zweite'), /keine freien Fächer/);
  assert.doesNotThrow(() => addCard(data, 152, 'Test', 'anderer Binder'));
  removeCard(data, 'test-0');
  assert.doesNotThrow(() => addCard(data, 133, 'Test', 'frei geworden'));
});

test('Karten bleiben beim erneuten Laden erhalten und Initialisieren überschreibt nichts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pokemon-binder-'));
  try {
    const path = join(dir, 'collection.json');
    const data = await loadDatabase(seedPath);
    await saveDatabase(path, data, { create: true });
    const card = addCard(data, 133, 'Basis', '123/102');
    await saveDatabase(path, data);
    const reloaded = await loadDatabase(path);
    assert.deepEqual(reloaded.cards, [card]);
    await assert.rejects(saveDatabase(path, await loadDatabase(seedPath), { create: true }), { code: 'EEXIST' });
    assert.deepEqual((await loadDatabase(path)).cards, [card]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI initialisiert, speichert und entfernt eine Karte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pokemon-binder-cli-'));
  try {
    const path = join(dir, 'collection.json');
    const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
    const run = (...args) => execFileSync(process.execPath, [cli, ...args], {
      encoding: 'utf8',
      env: { ...process.env, BINDER_DB: path },
    });
    run('init');
    const before = search(await loadDatabase(path), 134)[0].slots[0];
    run('add-card', '133', 'Testset', '1/100');
    run('add-card', '133', 'Testset', '2/100');
    const data = await loadDatabase(path);
    assert.equal(data.cards.length, 2);
    assert.notDeepEqual(search(data, 134)[0].slots[0], before);
    assert.match(run('search', 'Evoli'), /Testset 2\/100/);
    run('remove-card', data.cards[1].id);
    assert.deepEqual(search(await loadDatabase(path), 134)[0].slots[0], before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Ungültige Referenzen und unbekannte Karten werden abgelehnt', async () => {
  const data = await loadDatabase(seedPath);
  assert.throws(() => addCard(data, 99999, 'Set', '1'), /Kein Pokémon/);
  assert.throws(() => addCard(data, 133, '', '1'), /Set und Kartennummer/);
  assert.throws(() => removeCard(data, 'unbekannt'), /nicht gefunden/);
  assert.throws(() => search(data, ''), /Bitte einen Namen/);
  const placeholder = data.binders[3].entries.find((entry) => entry.dex === 475);
  placeholder.name = 'Falsch';
  assert.throws(() => validate(data), /Ungültiger Platzhalter/);
});
