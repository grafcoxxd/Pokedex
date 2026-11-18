import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePokemon } from '../src/pokemon-resolution.js';

test('National-Dex-Angaben aus dem Katalog werden dedupliziert übernommen', async () => {
  const result = await resolvePokemon({ dexIds: [282, 282], provider: 'tcgdex' }, () => {
    throw new Error('PokéAPI darf nicht aufgerufen werden');
  });
  assert.deepEqual(result, { dexIds: [282], source: 'catalog' });
  assert.deepEqual(await resolvePokemon({ dexIds: [281, 282], provider: 'tcgdex' }),
    { dexIds: [281, 282], source: 'catalog' });
});

test('Englischer PTCG-Pokémonname wird exakt mit PokéAPI abgeglichen', async () => {
  const card = { dexIds: [], provider: 'ptcg', englishName: 'Infernape' };
  const fetcher = async (url) => {
    assert.equal(url, 'https://pokeapi.co/api/v2/pokemon-species/infernape');
    return { ok: true, json: async () => ({ id: 392, names: [{ name: 'Infernape', language: { name: 'en' } }] }) };
  };
  assert.deepEqual(await resolvePokemon(card, fetcher), { dexIds: [392], source: 'pokeapi' });
  assert.deepEqual(await resolvePokemon({ ...card, englishName: 'Infernape ex' }, fetcher), { dexIds: [], source: null });
  const wrongName = async () => ({ ok: true, json: async () => ({ id: 392, names: [{ name: 'Other', language: { name: 'en' } }] }) });
  assert.deepEqual(await resolvePokemon(card, wrongName), { dexIds: [], source: null });
  assert.deepEqual(await resolvePokemon(card, async () => ({ ok: false, status: 404 })), { dexIds: [], source: null });
  await assert.rejects(resolvePokemon(card, async () => { throw new Error('offline'); }), /PokéAPI.*offline/);
  await assert.rejects(resolvePokemon(card, async () => ({ ok: false, status: 503 })), /HTTP 503/);
});
