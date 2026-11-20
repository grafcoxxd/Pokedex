import test from 'node:test';
import assert from 'node:assert/strict';
import { getCard, getSetCards, searchCards, searchSets } from '../src/tcgdex.js';
import { linkCard, loadDatabase, addCard, validate } from '../src/binder.js';

const fake = async (url) => {
  const data = {
    'https://api.tcgdex.net/v2/de/sets': [
      { id: 'set1', name: 'Testset', cardCount: { official: 100 } },
      { id: 'set2', name: 'Testset Plus', cardCount: { official: 189 } },
    ],
    'https://api.tcgdex.net/v2/de/sets/set1': { cards: [
      { id: 'set1-1', localId: '001', name: 'Evoli', image: 'https://assets.tcgdex.net/de/era/set1/1' },
    ] },
    'https://api.tcgdex.net/v2/de/sets/set2': { cards: [
      { id: 'set2-1', localId: '1', name: 'Pikachu' },
    ] },
    'https://api.tcgdex.net/v2/de/cards/set1-1': {
      id: 'set1-1', localId: '001', name: 'Evoli', set: { name: 'Testset' },
      dexId: [133], image: 'https://assets.tcgdex.net/de/era/set1/1',
    },
  };
  return { ok: url in data, status: 404, json: async () => data[url] };
};

test('Kartensuche findet alle passenden Sets und normalisiert die gedruckte Nummer', async () => {
  const result = await searchCards('', '1', 'de', fake);
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].image, 'https://assets.tcgdex.net/de/era/set1/1/low.webp');
  assert.equal(result.cards[1].image, null);
  const narrowed = await searchCards('', '001/0100', 'de', fake);
  assert.deepEqual(narrowed.cards.map((card) => card.id), ['set1-1', 'set2-1']);
  assert.deepEqual((await searchCards('', '1/189', 'de', fake)).cards.map((card) => card.id), ['set1-1', 'set2-1']);
  assert.equal((await searchCards('Testset', '1/999', 'de', fake)).cards.length, 2);
  assert.equal(narrowed.cards[0].suffixVerified, false);
  assert.equal((await searchCards('Testset', '2', 'de', fake)).cards.length, 0);
  await assert.rejects(searchCards('', '1/', 'de', fake), /Kartennummer/);
});

test('Auswahl speichert nur geprüfte Metadaten und verändert keine Position', async () => {
  const data = await loadDatabase(new URL('../data/seed.json', import.meta.url));
  const card = addCard(data, 133, 'Mein Set', '001/100');
  const found = await getCard('set1-1', 'de', fake);
  assert.deepEqual(found.dexIds, [133]);
  linkCard(data, card.id, found);
  assert.equal(card.tcgdex.image, 'https://assets.tcgdex.net/de/era/set1/1/low.webp');
  assert.equal(card.set, 'Mein Set');
  assert.equal(card.number, '001/100');
  assert.equal(data.cards.length, 1);
  assert.doesNotThrow(() => validate(JSON.parse(JSON.stringify(data))));
  assert.throws(() => linkCard(data, card.id, { ...found, image: 'https://example.com/image' }), /Ungültige TCGdex/);
  assert.equal(card.tcgdex.image, found.image);
  assert.throws(() => linkCard(data, 'not-found', found), /nicht gefunden/);
});

test('Ungültige Bild-URLs, fehlende Bilder und API-Fehler werden behandelt', async () => {
  const missing = async () => ({ ok: true, json: async () => ({
    id: 'x-1', localId: '1', name: 'Karte', set: { name: 'Set' },
    image: 'https://example.com/not-allowed',
  }) });
  assert.equal((await getCard('x-1', 'en', missing)).image, null);
  await assert.rejects(getCard('../x', 'de', fake), /Karten-ID/);
  await assert.rejects(getCard('x-1', 'fr', fake), /Kartensprache/);
  await assert.rejects(searchCards('Test', '1', 'de', async () => { throw new Error('offline'); }), /nicht erreichbar/);
  await assert.rejects(getCard('x-1', 'de', async () => ({ ok: false, status: 503 })), /HTTP 503/);
});

test('Weitere passende Sets können durchgeblättert werden', async () => {
  const many = async (url) => ({
    ok: true,
    json: async () => url.endsWith('/sets')
      ? Array.from({ length: 16 }, (_, index) => ({ id: `s${index}`, name: `Set ${index}` }))
      : { cards: [{ id: `${url.split('/').pop()}-1`, localId: '1', name: 'Karte' }] },
  });
  const first = await searchCards('', '1', 'ja', many);
  const second = await searchCards('', '1', 'ja', many, 2);
  assert.equal(first.hasMore, true);
  assert.equal(first.cards.length, 15);
  assert.equal(second.hasMore, false);
  assert.deepEqual(second.cards.map((card) => card.id), ['s15-1']);
});

test('Koreanische und chinesische IDs sowie Sprachcodes sind zulässig', async () => {
  for (const language of ['ja', 'ko', 'zh-tw', 'zh-cn']) {
    const fetcher = async () => ({ ok: true, json: async () => ({
      id: 'sv03.5-001', localId: '001', name: 'Karte', set: { name: 'Set' },
      image: `https://assets.tcgdex.net/${language}/sv/sv03.5/001`,
    }) });
    const found = await getCard('sv03.5-001', language, fetcher);
    const data = await loadDatabase(new URL('../data/seed.json', import.meta.url));
    const card = addCard(data, 133, 'Set', '001/165');
    assert.doesNotThrow(() => linkCard(data, card.id, found));
    assert.equal(card.tcgdex.language, language);
  }
});

test('Eine vollständige API-Kartennummer mit Schrägstrich wird korrekt verglichen', async () => {
  const fetcher = async (url) => ({ ok: true, json: async () => url.endsWith('/sets')
    ? [{ id: 'special', name: 'Spezial', cardCount: { official: 196 } }]
    : { cards: [{ id: 'special-0901', localId: '0901/07', name: 'Karte' }] } });
  const found = await searchCards('', '0901/07', 'zh-cn', fetcher);
  assert.equal(found.cards.length, 1);
  assert.equal(found.cards[0].suffixVerified, true);
  assert.equal((await searchCards('', '0901/08', 'zh-cn', fetcher)).cards.length, 0);
});

test('Koreanische Kartensprache und japanische Vergleichskarte bleiben getrennt gespeichert', async () => {
  const data = await loadDatabase(new URL('../data/seed.json', import.meta.url));
  const card = addCard(data, 57, 'Mein koreanisches Set', '041/081');
  const found = { id: 'M5-041', language: 'ja', name: 'オコリザル', image: null };
  linkCard(data, card.id, found, 'ko');
  const persisted = JSON.parse(JSON.stringify(data));
  validate(persisted);
  assert.equal(persisted.cards[0].cardLanguage, 'ko');
  assert.equal(persisted.cards[0].tcgdex.language, 'ja');
  assert.equal(persisted.cards[0].number, '041/081');
  assert.equal(persisted.cards[0].set, 'Mein koreanisches Set');
  assert.throws(() => linkCard(data, card.id, found, 'invalid'), /Kartensprache/);
  assert.equal(card.cardLanguage, 'ko');
});

test('Japanische Vergleichssuche berücksichtigt vollständige Eingabe ohne Setgrößenfilter', async () => {
  const mock = async (url) => ({ ok: true, json: async () => url.endsWith('/sets')
    ? [{ id: 'M5', name: 'Abyss Eye', cardCount: { official: 81 } }]
    : { cards: [{ id: 'M5-041', localId: '041', name: 'オコリザル' }] } });
  const result = await searchCards('M5', '041/081', 'ja', mock);
  assert.equal(result.cards[0].id, 'M5-041');
  assert.equal(result.cards[0].language, 'ja');
  assert.equal(result.cards[0].suffixVerified, false);
});

test('Gedrucktes Setkürzel wird mit Sprachzusatz über den englischen Setnamen zugeordnet', async () => {
  const data = {
    'https://api.tcgdex.net/v2/de/sets': [{ id: 'me06', name: 'Delta-Herrschaft' }],
    'https://api.tcgdex.net/v2/en/sets': [{ id: 'me06', name: 'Delta Reign' }],
    'https://api.pokemontcg.io/v2/sets?q=ptcgoCode%3ADLR': {
      data: [{ id: 'me6', name: 'Delta Reign', ptcgoCode: 'DLR' }],
    },
    'https://api.tcgdex.net/v2/de/sets/me06': {
      cards: [{ id: 'me06-078', localId: '078', name: 'Evoli' }],
    },
  };
  const fetcher = async (url) => ({ ok: url in data, status: 404, json: async () => data[url] });
  for (const code of ['DLR DE', 'dlr']) {
    const result = await searchCards(code, '078/103', 'de', fetcher);
    assert.deepEqual(result.cards.map((card) => card.id), ['me06-078']);
  }
  assert.equal((await searchCards('DLR EN', '078/103', 'de', fetcher)).cards.length, 0);
  await assert.rejects(searchCards('DLR DE', '078/103', 'de', async (url) => {
    if (url.startsWith('https://api.pokemontcg.io/')) throw new Error('offline');
    return fetcher(url);
  }), /Setkürzel-Suche.*offline/);
  assert.deepEqual((await searchSets('DLR DE', 'de', 1, fetcher)).sets.map((set) => set.id), ['me06']);
});

test('Setübersicht begrenzt Settreffer und prüft Daten und Bild-URLs', async () => {
  const fetcher = async (url) => ({ ok: true, json: async () => url.endsWith('/sets')
    ? Array.from({ length: 16 }, (_, index) => ({ id: `s${index}`, name: `Set ${index}` }))
    : { id: 's0', name: 'Set 0', cardCount: { total: 2 },
      cards: [{ id: 's0-1', localId: '1', name: 'Karte', image: 'https://example.com/image' }] } });
  const first = await searchSets('Set', 'ja', 1, fetcher);
  assert.equal(first.sets.length, 15);
  assert.equal(first.hasMore, true);
  assert.deepEqual((await searchSets('Set', 'ja', 2, fetcher)).sets.map((set) => set.id), ['s15']);
  const detail = await getSetCards('s0', 'ja', fetcher);
  assert.equal(detail.total, 2);
  assert.equal(detail.cards[0].image, null);
  await assert.rejects(getSetCards('s1', 'ja', fetcher), /Ungültige Setdaten/);
});

test('Setvorschläge tolerieren Satzzeichen und Tippfehler und sortieren passende Ergebnisse zuerst', async () => {
  const fetcher = async () => ({ ok: true, json: async () => [
    { id: 'special', name: 'Delta-Herrschaft Spezial' },
    { id: 'me06', name: 'Delta-Herrschaft' },
    { id: 'sv9a', name: 'Heat Wave Arena' },
    { id: 'other', name: 'Andere Erweiterung' },
  ] });
  const names = async (query) => (await searchSets(query, 'de', 1, fetcher)).sets.map((set) => set.id);
  assert.deepEqual((await names('Delta Herrschaft')).slice(0, 2), ['me06', 'special']);
  assert.deepEqual((await names('delta herrchaf')).slice(0, 2), ['special', 'me06']);
  assert.equal((await names('sv9a'))[0], 'sv9a');
  assert.deepEqual(await names('Andere Erweiterung'), ['other']);
});
