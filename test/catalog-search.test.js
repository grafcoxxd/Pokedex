import test from 'node:test';
import assert from 'node:assert/strict';
import { getBoosterSet, searchBoosterSets, searchCatalog } from '../src/catalog-search.js';

const tcg = 'https://api.tcgdex.net/v2';
const ptcg = 'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data';
const data = {
  'https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1/sets.json': { sets: [] },
  [`${tcg}/zh-cn/sets`]: [{ id: 'CBB4C', name: 'Gem Pack 4' }],
  [`${tcg}/zh-cn/sets/CBB4C`]: { id: 'CBB4C', name: 'Gem Pack 4', cardCount: { total: 2 },
    cards: [{ id: 'CBB4C-0901', localId: '0901', name: 'Panferno' }] },
  [`${ptcg}/sets_index.json`]: [{ id: 'CBB4C', code: 'CBB4C', name: '宝石包 Vol.4' }],
  [`${ptcg}/cards/CBB4C.json`]: [{ setCode: 'CBB4C', cardIndex: '0901', cardName: '烈焰猴' }],
  [`${tcg}/ko/sets`]: [],
  [`${tcg}/ja/sets`]: [{ id: 'M5', name: 'Abyss Eye' }],
  [`${tcg}/ja/sets/M5`]: { id: 'M5', name: 'Abyss Eye', cards: [{ id: 'M5-041', localId: '041', name: 'オコリザル' }] },
  [`${tcg}/ko/sets/M5`]: { id: 'M5', name: 'Koreanisches Set', cardCount: { total: 81 }, cards: [] },
};
const fake = async (url) => ({ ok: url in data, status: url in data ? 200 : 404, json: async () => data[url] });

test('Set ist verpflichtend; vereinfachtes Chinesisch durchsucht beide Kataloge', async () => {
  await assert.rejects(searchCatalog('  ', '0901/07', 'zh-cn', 1, fake), /Setnamen/);
  const result = await searchCatalog('CBB4C', '0901/07', 'zh-cn', 1, fake);
  assert.deepEqual(result.cards.map(({ provider, language }) => [provider, language]),
    [['tcgdex', 'zh-cn'], ['ptcg', 'zh-cn']]);
  assert.deepEqual(result.warnings, []);
});

test('Koreanische Suche kennzeichnet japanische Vergleichskarten', async () => {
  const result = await searchCatalog('M5', '041/081', 'ko', 1, fake);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].id, 'M5-041');
  assert.equal(result.cards[0].language, 'ja');
  assert.equal(result.cards[0].comparison, true);
  assert.equal(result.cards[0].suffixVerified, false);
});

test('Ausfall einer Quelle bleibt sichtbar und andere Treffer bleiben nutzbar', async () => {
  const offline = async (url, options) => {
    if (url.startsWith(ptcg)) throw new Error('offline');
    return fake(url, options);
  };
  const result = await searchCatalog('CBB4C', '0901/07', 'zh-cn', 1, offline);
  assert.equal(result.cards.length, 1);
  assert.match(result.warnings[0], /PTCG-card-data.*offline/);
  await assert.rejects(searchCatalog('M5', '041', 'ko', 1, async () => { throw new Error('offline'); }), /TCGdex.*offline/);
});

test('Setübersicht findet beide chinesischen Quellen und liefert ihre Karten getrennt', async () => {
  const found = await searchBoosterSets('CBB4C', 'zh-cn', 1, fake);
  assert.deepEqual(found.sets.map((set) => set.provider), ['tcgdex', 'ptcg']);
  const tcgdex = await getBoosterSet('CBB4C', 'zh-cn', 'tcgdex', fake);
  assert.equal(tcgdex.total, 2);
  assert.deepEqual(tcgdex.cards.map((card) => card.number), ['0901']);
  const ptcgResult = await getBoosterSet('CBB4C', 'zh-cn', 'ptcg', fake);
  assert.equal(ptcgResult.total, null);
  assert.deepEqual(ptcgResult.cards.map((card) => card.name), ['烈焰猴']);
  await assert.rejects(getBoosterSet('CBB4C', 'de', 'ptcg', fake), /Kartensprache/);
  await assert.rejects(getBoosterSet('../CBB4C', 'zh-cn', 'tcgdex', fake), /Set-ID/);
  const similar = await searchBoosterSets('Gem-Pack 4', 'zh-cn', 1, fake);
  assert.equal(similar.sets[0].id, 'CBB4C');
});

test('Setübersicht zeigt Ausfall einzelner Quellen und ungültige Suchanfragen', async () => {
  const offline = async (url) => {
    if (url.startsWith(ptcg)) throw new Error('offline');
    return fake(url);
  };
  const found = await searchBoosterSets('CBB4C', 'zh-cn', 1, offline);
  assert.equal(found.sets.length, 1);
  assert.match(found.warnings[0], /PTCG-card-data.*offline/);
  await assert.rejects(searchBoosterSets(' ', 'de', 1, fake), /Setnamen/);
  await assert.rejects(searchBoosterSets('CBB4C', 'zh-cn', 0, fake), /Suchseite/);
  await assert.rejects(searchBoosterSets('CBB4C', 'de', 1, async () => { throw new Error('offline'); }), /offline/);
});

test('Koreanische Setübersicht bietet japanische Vergleichslisten ausdrücklich gekennzeichnet an', async () => {
  const search = await searchBoosterSets('M5', 'ko', 1, fake);
  assert.equal(search.sets[0].comparison, true);
  assert.equal(search.sets[0].language, 'ja');
  const detail = await getBoosterSet('M5', 'ko', 'tcgdex', fake);
  assert.equal(detail.comparison, true);
  assert.equal(detail.originalName, 'Koreanisches Set');
  assert.deepEqual(detail.cards.map((card) => card.id), ['M5-041']);
  const withoutJapanese = async (url) => url === `${tcg}/ja/sets/M5`
    ? { ok: false, status: 404 }
    : fake(url);
  assert.deepEqual((await getBoosterSet('M5', 'ko', 'tcgdex', withoutJapanese)).cards, []);
  const koreanCards = async (url) => url === `${tcg}/ko/sets/M5`
    ? { ok: true, json: async () => ({ ...data[url], cards: [{ id: 'M5-001', localId: '001', name: 'Karte' }] }) }
    : fake(url);
  const korean = await getBoosterSet('M5', 'ko', 'tcgdex', koreanCards);
  assert.equal(korean.comparison, undefined);
  assert.equal(korean.cards[0].id, 'M5-001');
});

test('Leere Setlisten werden unabhängig von der gemeldeten Setgröße ausgeblendet', async () => {
  const mock = async (url) => {
    if (url === `${tcg}/zh-cn/sets/CBB4C`) return { ok: true, json: async () => ({ ...data[url], cards: [] }) };
    return fake(url);
  };
  const result = await searchBoosterSets('CBB4C', 'zh-cn', 1, mock);
  assert.deepEqual(result.sets.map((set) => set.provider), ['ptcg']);
  const emptyBoth = async (url) => url === `${ptcg}/cards/CBB4C.json`
    ? { ok: true, json: async () => [] } : mock(url);
  assert.deepEqual((await searchBoosterSets('CBB4C', 'zh-cn', 1, emptyBoth)).sets, []);
});

test('Koreanisches Set mit japanischer Vergleichsliste bleibt verfügbar', async () => {
  const mock = async (url) => url === `${tcg}/ko/sets`
    ? { ok: true, json: async () => [{ id: 'M5', name: 'Koreanisches Set' }] } : fake(url);
  const result = await searchBoosterSets('M5', 'ko', 1, mock);
  assert.deepEqual(result.sets.map((set) => [set.language, Boolean(set.comparison)]),
    [['ko', false], ['ja', true]]);
});

test('Nicht prüfbare Setliste bleibt mit Warnung sichtbar', async () => {
  const mock = async (url) => url === `${tcg}/zh-cn/sets/CBB4C`
    ? { ok: false, status: 503 } : fake(url);
  const result = await searchBoosterSets('CBB4C', 'zh-cn', 1, mock);
  assert.deepEqual(result.sets.map((set) => set.provider), ['tcgdex', 'ptcg']);
  assert.match(result.warnings[0], /Kartenliste konnte nicht geprüft werden.*503/);
});

test('Paginierung berücksichtigt leere Sets vor dem Seitenumbruch', async () => {
  const mock = async (url) => {
    if (url === `${tcg}/ja/sets`) return { ok: true, json: async () => Array.from(
      { length: 34 }, (_, index) => ({ id: `s${index}`, name: `Set ${index}` })) };
    const match = url.match(/\/ja\/sets\/s(\d+)$/);
    if (match) {
      const number = Number(match[1]);
      return { ok: true, json: async () => ({ id: `s${number}`, name: `Set ${number}`,
        cards: number < 3 ? [] : [{ id: `s${number}-1`, localId: '1', name: 'Karte' }] }) };
    }
    return fake(url);
  };
  const first = await searchBoosterSets('Set', 'ja', 1, mock);
  const second = await searchBoosterSets('Set', 'ja', 2, mock);
  const third = await searchBoosterSets('Set', 'ja', 3, mock);
  assert.equal(first.sets.length, 15);
  assert.equal(first.hasMore, true);
  assert.equal(second.sets.length, 15);
  assert.equal(second.hasMore, true);
  assert.equal(third.sets.length, 1);
  assert.equal(third.hasMore, false);
  assert.equal(new Set([...first.sets, ...second.sets, ...third.sets].map((set) => set.id)).size, 31);
});
