import test from 'node:test';
import assert from 'node:assert/strict';
import { getPokedex } from '../src/pokedex.js';

const root = 'https://pokeapi.co/api/v2';
const url = (path) => `${root}/${path}/`;
const pokemon = (id, types) => ({
  id, height: 10, weight: 130,
  cries: { latest: `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg` },
  types: types.map((name) => ({ type: { name } })),
  abilities: [{ ability: { name: 'overgrow' }, is_hidden: false }],
  stats: [{ stat: { name: 'hp' }, base_stat: 60 }],
});
const species = (id, name) => ({
  id, name, gender_rate: id === 2 ? 1 : -1,
  names: [{ language: { name: 'de' }, name }],
  genera: [{ language: { name: 'de' }, genus: 'Samen-Pokémon' }],
  flavor_text_entries: [{ language: { name: 'de' }, flavor_text: 'Ein\nText.', version: { name: 'x' } }],
  evolution_chain: { url: url('evolution-chain/1') },
});
const child = (id, evolves_to = []) => ({ species: { url: url(`pokemon-species/${id}`) }, evolves_to });
const relation = (double = [], half = [], zero = []) => ({
  damage_relations: {
    double_damage_from: double.map((name) => ({ name })),
    half_damage_from: half.map((name) => ({ name })),
    no_damage_from: zero.map((name) => ({ name })),
  },
});
const responses = {
  [`${root}/pokemon/2`]: pokemon(2, ['grass', 'poison']),
  [`${root}/pokemon-species/2`]: species(2, 'Bisaknosp'),
  [`${root}/pokemon/1`]: pokemon(1, ['grass']),
  [`${root}/pokemon-species/1`]: species(1, 'Bisasam'),
  [`${root}/pokemon/3`]: pokemon(3, ['grass', 'poison']),
  [`${root}/pokemon-species/3`]: species(3, 'Bisaflor'),
  [`${root}/pokemon/4`]: pokemon(4, ['fire']),
  [`${root}/pokemon-species/4`]: species(4, 'Glumanda'),
  [`${root}/evolution-chain/1`]: { chain: child(1, [child(2, [child(3), child(4)])]) },
  [`${root}/ability/overgrow`]: { names: [{ language: { name: 'de' }, name: 'Notdünger' }] },
  [`${root}/type/grass`]: relation(['fire', 'flying', 'bug'], [], ['ground']),
  [`${root}/type/poison`]: relation(['fire', 'ground'], ['bug']),
};
const mock = async (address) => ({ ok: address in responses, status: address in responses ? 200 : 404, json: async () => responses[address] });

test('Pokédex liefert übersetzte Angaben, kombinierte Schwächen und verzweigte Familie', async () => {
  const found = await getPokedex(2, mock);
  assert.equal(found.description, 'Ein Text.');
  assert.equal(found.category, 'Samen-Pokémon');
  assert.equal(found.cry, 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/2.ogg');
  assert.deepEqual(found.types.map((type) => type.name), ['Pflanze', 'Gift']);
  assert.deepEqual(found.weaknesses.map((type) => [type.id, type.multiplier]), [['flying', 2], ['fire', 4]]);
  assert.deepEqual(found.abilities, [{ name: 'Notdünger', hidden: false }]);
  assert.deepEqual(found.evolutions.map((item) => [item.id, item.parent]), [[1, null], [2, 1], [3, 2], [4, 2]]);
});

test('Fehlende Rufe bleiben verfügbar, ungültige Audio-Verweise werden abgelehnt', async () => {
  const withCry = (cries) => async (address) => address.endsWith('/pokemon/2')
    ? { ok: true, json: async () => ({ ...pokemon(2, ['grass', 'poison']), cries }) }
    : mock(address);
  assert.equal((await getPokedex(2, withCry(null))).cry, null);
  assert.equal((await getPokedex(2, withCry({ latest: null }))).cry, null);
  await assert.rejects(getPokedex(2, withCry({ latest: 'https://example.com/2.ogg' })), /Ruf-Verweis/);
  await assert.rejects(getPokedex(2, withCry({ latest: 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/3.ogg' })), /Ruf-Verweis/);
});

test('Ungültige Eingaben und externe Fehler werden gemeldet', async () => {
  await assert.rejects(getPokedex(0, mock), /National-Dex/);
  await assert.rejects(getPokedex(2, async () => { throw new Error('offline'); }), /nicht erreichbar.*offline/);
  await assert.rejects(getPokedex(2, async () => ({ ok: false, status: 503 })), /HTTP 503/);
  const unsafe = async (address) => address.endsWith('/pokemon-species/2')
    ? { ok: true, json: async () => ({ ...species(2, 'Bisaknosp'), evolution_chain: { url: 'https://example.com/1/' } }) }
    : mock(address);
  await assert.rejects(getPokedex(2, unsafe), /Verweis/);
});
