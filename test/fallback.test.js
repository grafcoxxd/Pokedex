import test from 'node:test';
import assert from 'node:assert/strict';
import { findGermanImage } from '../src/fallback.js';

const root = 'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data';
const tcg = 'https://api.tcgdex.net/v2';
const responses = {
  [`${root}/sets_index.json`]: [{ id: 'CBB4C', code: 'CBB4C', name: '宝石包 Vol.4' }],
  [`${root}/cards/CBB4C.json`]: [{ setCode: 'CBB4C', cardIndex: '0901', cardName: '烈焰猴', nameEn: 'Infernape', setCodeEn: 'TWM', cardIndexEn: '33' }],
  'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json': [{ name: 'Twilight Masquerade', ptcgoCode: 'TWM' }],
  [`${tcg}/en/sets`]: [{ id: 'sv06', name: 'Twilight Masquerade' }],
  [`${tcg}/de/sets/sv06`]: { cards: [{ id: 'sv06-033', localId: '033' }] },
  [`${tcg}/de/cards/sv06-033`]: { id: 'sv06-033', name: 'Panferno', localId: '033', set: { name: 'Maskerade' }, image: 'https://assets.tcgdex.net/de/sv/sv06/033' },
  [`${tcg}/ja/cards/sv06-033`]: { id: 'sv06-033', name: 'Original', localId: '033', set: { name: 'Set' } },
};
const fetcher = async (url) => ({ ok: url in responses, status: url in responses ? 200 : 404, json: async () => responses[url] });

test('Chinesisches Panferno erhält ein gekennzeichnetes deutsches Ersatzbild', async () => {
  assert.deepEqual(await findGermanImage('ptcg', 'zh-cn', 'CBB4C:0901', fetcher), {
    url: 'https://assets.tcgdex.net/de/sv/sv06/033/low.webp',
    label: 'Panferno · Maskerade · 033',
  });
});

test('TCGdex-Ersatzbild wird nur bei vorhandener deutscher Ausgabe gefunden', async () => {
  assert.ok(await findGermanImage('tcgdex', 'ja', 'sv06-033', fetcher));
  assert.equal(await findGermanImage('tcgdex', 'de', 'sv06-033', fetcher), null);
});

test('Fehler bei der Ersatzbildsuche werden nicht als Treffer ausgegeben', async () => {
  await assert.rejects(findGermanImage('ptcg', 'zh-cn', 'CBB4C:0901', async () => { throw new Error('offline'); }), /nicht erreichbar/);
  const ambiguous = async (url, opts) => url.endsWith('/sets/en.json')
    ? { ok: true, json: async () => [{ name: 'A', ptcgoCode: 'TWM' }, { name: 'B', ptcgoCode: 'TWM' }] }
    : fetcher(url, opts);
  assert.equal(await findGermanImage('ptcg', 'zh-cn', 'CBB4C:0901', ambiguous), null);
});

test('Japanisches Rasaff findet eine deutsche Vergleichsausgabe mit anderer ID', async () => {
  const cards = {
    [`${tcg}/ja/cards/M5-041`]: { id: 'M5-041', name: 'オコリザル', localId: '041',
      set: { name: 'Abyss Eye' }, dexId: [57], illustrator: 'GOSSAN', hp: 110, stage: 'Stage1' },
    [`${tcg}/de/cards/me05-043`]: { id: 'me05-043', name: 'Rasaff', localId: '043',
      set: { name: 'Dunkelnacht' }, dexId: [57], illustrator: 'GOSSAN', hp: 110, stage: 'Rang 1',
      image: 'https://assets.tcgdex.net/de/me/me05/043' },
  };
  const mock = async (url) => {
    if (url.startsWith(`${tcg}/de/cards?`)) {
      const params = new URL(url).searchParams;
      assert.equal(params.get('illustrator'), 'eq:GOSSAN');
      assert.equal(params.get('dexId'), '57');
      return { ok: true, json: async () => [{ id: 'me05-043' }] };
    }
    return { ok: url in cards, status: url in cards ? 200 : 404, json: async () => cards[url] };
  };
  assert.deepEqual(await findGermanImage('tcgdex', 'ja', 'M5-041', mock), {
    url: 'https://assets.tcgdex.net/de/me/me05/043/low.webp',
    label: 'Rasaff · Dunkelnacht · 043',
  });
  const ambiguous = async (url) => {
    if (url.startsWith(`${tcg}/de/cards?`)) return { ok: true, json: async () => [{ id: 'me05-043' }, { id: 'other-043' }] };
    if (url.endsWith('/de/cards/other-043')) return { ok: true, json: async () => ({
      ...cards[`${tcg}/de/cards/me05-043`], id: 'other-043', image: null,
    }) };
    return mock(url);
  };
  assert.equal(await findGermanImage('tcgdex', 'ja', 'M5-041', ambiguous), null);
  const missingStage = async (url) => url.endsWith('/ja/cards/M5-041')
    ? { ok: true, json: async () => ({ ...cards[url], stage: undefined }) }
    : mock(url);
  assert.equal(await findGermanImage('tcgdex', 'ja', 'M5-041', missingStage), null);
});
