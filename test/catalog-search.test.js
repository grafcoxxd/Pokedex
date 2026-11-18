import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCatalog } from '../src/catalog-search.js';

const tcg = 'https://api.tcgdex.net/v2';
const ptcg = 'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data';
const data = {
  [`${tcg}/zh-cn/sets`]: [{ id: 'CBB4C', name: 'Gem Pack 4' }],
  [`${tcg}/zh-cn/sets/CBB4C`]: { cards: [{ id: 'CBB4C-0901', localId: '0901', name: 'Panferno' }] },
  [`${ptcg}/sets_index.json`]: [{ id: 'CBB4C', code: 'CBB4C', name: '宝石包 Vol.4' }],
  [`${ptcg}/cards/CBB4C.json`]: [{ setCode: 'CBB4C', cardIndex: '0901', cardName: '烈焰猴' }],
  [`${tcg}/ko/sets`]: [],
  [`${tcg}/ja/sets`]: [{ id: 'M5', name: 'Abyss Eye' }],
  [`${tcg}/ja/sets/M5`]: { cards: [{ id: 'M5-041', localId: '041', name: 'オコリザル' }] },
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
