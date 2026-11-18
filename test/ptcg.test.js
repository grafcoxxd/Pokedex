import test from 'node:test';
import assert from 'node:assert/strict';
import { getChineseCard, searchChineseCards } from '../src/ptcg.js';
import { addCard, linkCard, loadDatabase, validate } from '../src/binder.js';

const fake = async (url) => {
  const responses = {
    'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data/sets_index.json': [
      { id: 'CBB4C', code: 'CBB4C', name: '宝石包 Vol.4' },
      { id: 'CBB5C', code: 'CBB5C', name: '宝石包 Vol.5' },
    ],
    'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data/cards/CBB4C.json': [
      { setCode: 'CBB4C', cardIndex: '0901', cardName: '烈焰猴', nameEn: 'Infernape' },
    ],
    'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data/cards/CBB5C.json': [
      { setCode: 'CBB5C', cardIndex: '0901', cardName: '卡片' },
    ],
  };
  return { ok: url in responses, status: 404, json: async () => responses[url] };
};

test('Sondernummer 0901/07 findet Karten aus mehreren Sets ohne unbelegten Nenner', async () => {
  const result = await searchChineseCards('', '0901/07', 1, fake);
  assert.deepEqual(result.cards.map((card) => card.id), ['CBB4C:0901', 'CBB5C:0901']);
  assert.equal(result.cards[0].name, '烈焰猴 (Infernape)');
  assert.equal(result.cards[0].officialTotal, null);
  assert.equal(result.cards[0].image, null);
  assert.equal((await searchChineseCards('CBB4C', '0902/07', 1, fake)).cards.length, 0);
});

test('Katalogverknüpfung überlebt Speicherung und ersetzt bestehende Quelle', async () => {
  const data = await loadDatabase(new URL('../data/seed.json', import.meta.url));
  const card = addCard(data, 392, 'Set', '0901/07');
  const found = await getChineseCard('CBB4C:0901', fake);
  linkCard(data, card.id, found);
  assert.equal(card.ptcg.id, 'CBB4C:0901');
  assert.doesNotThrow(() => validate(JSON.parse(JSON.stringify(data))));
  assert.equal(card.number, '0901/07');
  assert.throws(() => linkCard(data, card.id, { ...found, image: 'https://example.com' }), /Ungültige PTCG/);
  assert.equal(card.ptcg.id, 'CBB4C:0901');
  await assert.rejects(getChineseCard('../CBB4C:0901', fake), /Ungültige/);
});

test('Quelle oder Datenfehler werden sichtbar', async () => {
  await assert.rejects(searchChineseCards('', '0901/07', 1, async () => { throw new Error('offline'); }), /nicht erreichbar/);
  await assert.rejects(getChineseCard('CBB4C:0000', fake), /Karte nicht/);
});
