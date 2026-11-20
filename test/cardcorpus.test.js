import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichBoosterSet } from '../src/cardcorpus.js';
import { getBoosterSet, getCardCorpusExtra, searchCatalog } from '../src/catalog-search.js';

const root = 'https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1';
const tcg = 'https://api.tcgdex.net/v2';
const imageId = 'b3b1502d491f169018510b895e67ca09';
const link = { $kind: 'card', set: 'international/pitch-black', card: '048', language: 'en' };
const original = { name: 'Abyss Eye', cards: [
  { id: 'M5-046', name: 'メガダークライex', number: '046', image: null },
  { id: 'M5-118', name: 'メガダークライex', number: '118', image: null },
], total: 2 };
const data = {
  [`${root}/sets.json`]: { sets: [
    { id: 'japanese/abyss-eye', catalog: 'japanese', code: 'M5' },
    { id: 'international/pitch-black', catalog: 'international', name: 'Pitch Black' },
  ] },
  [`${root}/sets/japanese/abyss-eye.json`]: { id: 'japanese/abyss-eye', cards: [
    { name: 'Mega Darkrai ex', number: { numerator: '46' }, picture: { front: { image: imageId } },
      links: { counterparts: { international: [link] } } },
    { name: 'Mega Darkrai ex', number: { numerator: '118' }, picture: { front: { image: imageId } } },
  ] },
  [`${tcg}/en/sets`]: [{ id: 'me05', name: 'Pitch Black' }],
  [`${tcg}/de/sets/me05`]: { id: 'me05', name: 'Dunkelnacht',
    cards: [{ id: 'me05-048', localId: '048', name: 'Mega-Darkrai-ex' }] },
  [`${tcg}/ko/sets`]: [],
  [`${tcg}/ja/sets`]: [{ id: 'M5', name: 'Abyss Eye' }],
  [`${tcg}/ja/sets/M5`]: { id: 'M5', name: 'Abyss Eye', cards: [
    { id: 'M5-046', localId: '046', name: 'メガダークライex' },
    { id: 'M5-118', localId: '118', name: 'メガダークライex' },
  ] },
  [`${tcg}/ja/cards/M5-118`]: { id: 'M5-118', localId: '118', name: 'メガダークライex',
    set: { id: 'M5', name: 'Abyss Eye' }, dexId: [491] },
};
const fake = async (url) => ({ ok: url in data, status: url in data ? 200 : 404, json: async () => data[url] });

test('CardCorpus ergänzt ein Originalbild und eindeutige deutsche Namen einschließlich gleicher Titel', async () => {
  const result = await enrichBoosterSet(original, 'M5', 'ja', fake);
  assert.equal(result.cards[0].corpusImage, `https://img.cardcorpus.com/s1/480/${imageId}.avif`);
  assert.equal(result.cards[0].germanName, 'Mega-Darkrai-ex');
  assert.equal(result.cards[1].germanName, 'Mega-Darkrai-ex');
  assert.equal(result.cards[0].name, 'メガダークライex');
  assert.equal(original.cards[0].germanName, undefined);
});

test('Mehrdeutige Zuordnungen und ungültige Bild-IDs werden nicht übernommen', async () => {
  const ambiguous = async (url) => {
    if (url === `${root}/sets/japanese/abyss-eye.json`) {
      const source = data[url];
      return { ok: true, json: async () => ({ ...source, cards: [
        { ...source.cards[0], picture: { front: { image: '../evil' } },
          links: { counterparts: { international: [link, link] } } },
        source.cards[1], { ...source.cards[1] },
      ] }) };
    }
    return fake(url);
  };
  const result = await enrichBoosterSet(original, 'M5', 'ja', ambiguous);
  assert.equal(result.cards[0].corpusImage, undefined);
  assert.equal(result.cards[0].germanName, undefined);
  assert.equal(result.cards[1].corpusImage, undefined);
  assert.equal(result.cards[1].germanName, undefined);
});

test('Widersprüchliche deutsche Namen werden nicht auf Karten ohne Verweis übertragen', async () => {
  const extra = { id: 'M5-099', name: original.cards[0].name, number: '099', image: null };
  const mock = async (url) => {
    if (url === `${root}/sets/japanese/abyss-eye.json`) {
      return { ok: true, json: async () => ({ ...data[url], cards: [
        ...data[url].cards,
        { name: 'Mega Darkrai ex', number: { numerator: '099' },
          links: { counterparts: { international: [{ ...link, card: '101' }] } } },
      ] }) };
    }
    if (url === `${tcg}/de/sets/me05`) {
      return { ok: true, json: async () => ({ ...data[url], cards: [
        ...data[url].cards, { id: 'me05-101', localId: '101', name: 'Anderer Name' },
      ] }) };
    }
    return fake(url);
  };
  const result = await enrichBoosterSet({ ...original, cards: [...original.cards, extra] }, 'M5', 'ja', mock);
  assert.equal(result.cards[1].germanName, undefined);
  assert.equal(result.cards[2].germanName, 'Anderer Name');
});

test('Ausfall der Zusatzquelle lässt die gekennzeichnete japanische Vergleichsliste benutzbar', async () => {
  const mock = async (url) => {
    if (url === `${tcg}/ko/sets/M5`) return { ok: true, json: async () => ({ id: 'M5', name: 'Koreanisch', cards: [] }) };
    if (url === `${tcg}/ja/sets/M5`) return { ok: true, json: async () => ({ id: 'M5', name: 'Japanisch',
      cards: [{ id: 'M5-046', localId: '046', name: 'メガダークライex' }] }) };
    if (url === `${root}/sets.json`) throw new Error('offline');
    return fake(url);
  };
  const result = await getBoosterSet('M5', 'ko', 'tcgdex', mock);
  assert.equal(result.comparison, true);
  assert.equal(result.cards[0].id, 'M5-046');
  assert.match(result.warnings[0], /CardCorpus.*offline/);
});

test('Fehler bei der deutschen Zuordnung erhalten das CardCorpus-Bild und zeigen eine Warnung', async () => {
  const offline = async (url) => url === `${tcg}/en/sets`
    ? { ok: false, status: 503 } : fake(url);
  const result = await enrichBoosterSet(original, 'M5', 'ja', offline);
  assert.ok(result.cards[0].corpusImage);
  assert.equal(result.cards[0].germanName, undefined);
  assert.match(result.warnings[0], /Deutsche Kartennamen.*503/);
});

test('Kartensuche ergänzt japanische Vergleichskarte, ohne Quelle oder Sprache zu verändern', async () => {
  const result = await searchCatalog('M5', '118/081', 'ko', 1, fake);
  assert.equal(result.cards.length, 1);
  const card = result.cards[0];
  assert.equal(card.id, 'M5-118');
  assert.equal(card.provider, 'tcgdex');
  assert.equal(card.language, 'ja');
  assert.equal(card.comparison, true);
  assert.equal(card.suffixVerified, false);
  assert.equal(card.germanName, 'Mega-Darkrai-ex');
  assert.match(card.corpusImage, /img\.cardcorpus\.com/);
});

test('CardCorpus-Ausfall erhält Suchtreffer und zeigt eine Warnung', async () => {
  const offline = async (url) => {
    if (url === `${root}/sets.json`) throw new Error('offline');
    return fake(url);
  };
  const result = await searchCatalog('M5', '118', 'ja', 1, offline);
  assert.equal(result.cards[0].id, 'M5-118');
  assert.equal(result.cards[0].corpusImage, undefined);
  assert.match(result.warnings[0], /CardCorpus.*offline/);
});

test('Gespeicherte Katalogkarte kann CardCorpus-Bild erneut anhand ihrer ID abrufen', async () => {
  const result = await getCardCorpusExtra('M5-118', 'ja', 'tcgdex', fake);
  assert.equal(result.card.id, 'M5-118');
  assert.equal(result.card.germanName, 'Mega-Darkrai-ex');
  assert.match(result.card.corpusImage, /img\.cardcorpus\.com/);
  await assert.rejects(getCardCorpusExtra('M5-118', 'ko', 'tcgdex', fake), /Kartensprache/);
});
