const api = 'https://pokeapi.co/api/v2';
const typeNames = {
  normal: 'Normal', fighting: 'Kampf', flying: 'Flug', poison: 'Gift', ground: 'Boden',
  rock: 'Gestein', bug: 'Käfer', ghost: 'Geist', steel: 'Stahl', fire: 'Feuer',
  water: 'Wasser', grass: 'Pflanze', electric: 'Elektro', psychic: 'Psycho',
  ice: 'Eis', dragon: 'Drache', dark: 'Unlicht', fairy: 'Fee',
};
const cache = new Map();

async function get(path, fetcher) {
  if (!/^(pokemon|pokemon-species|evolution-chain|type|ability)\/[a-z0-9-]+$/.test(path)) {
    throw new Error('Ungültiger PokéAPI-Pfad.');
  }
  if (fetcher === fetch && cache.has(path)) return cache.get(path);
  let response;
  try {
    response = await fetcher(`${api}/${path}`, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`PokéAPI ist nicht erreichbar: ${error.message}`);
  }
  if (!response.ok) throw new Error(`PokéAPI meldet HTTP ${response.status} (${path}).`);
  let result;
  try { result = await response.json(); }
  catch { throw new Error(`Ungültige PokéAPI-Antwort (${path}).`); }
  if (fetcher === fetch) {
    if (cache.size >= 512) cache.delete(cache.keys().next().value);
    cache.set(path, result);
  }
  return result;
}

function resourceId(url, kind) {
  const match = typeof url === 'string' && url.match(new RegExp(`^https://pokeapi\\.co/api/v2/${kind}/(\\d+)/$`));
  if (!match) throw new Error(`Ungültiger ${kind}-Verweis von PokéAPI.`);
  return Number(match[1]);
}

function german(list, property) {
  return list?.find((item) => item.language?.name === 'de')?.[property] || null;
}

function mapType(type) {
  if (!Object.hasOwn(typeNames, type)) throw new Error(`Unbekannter Pokémon-Typ: ${type}.`);
  return { id: type, name: typeNames[type] };
}

export async function getPokedex(dex, fetcher = fetch) {
  if (!Number.isInteger(dex) || dex < 1 || dex > 1025) throw new Error('Ungültige National-Dex-Nummer.');
  const [pokemon, species] = await Promise.all([
    get(`pokemon/${dex}`, fetcher), get(`pokemon-species/${dex}`, fetcher),
  ]);
  if (pokemon.id !== dex || species.id !== dex || !Array.isArray(pokemon.types) ||
      !Array.isArray(pokemon.abilities) || !Array.isArray(pokemon.stats) ||
      !Number.isInteger(pokemon.height) || !Number.isInteger(pokemon.weight) ||
      !Number.isInteger(species.gender_rate) || species.gender_rate < -1 || species.gender_rate > 8) {
    throw new Error('Ungültige Pokémon-Daten von PokéAPI.');
  }
  const types = pokemon.types.map((item) => mapType(item.type.name));
  const chainId = resourceId(species.evolution_chain?.url, 'evolution-chain');
  const [typeDetails, abilityDetails, chain] = await Promise.all([
    Promise.all(types.map((type) => get(`type/${type.id}`, fetcher))),
    Promise.all(pokemon.abilities.map((item) => get(`ability/${item.ability.name}`, fetcher))),
    get(`evolution-chain/${chainId}`, fetcher),
  ]);
  const multipliers = new Map(Object.keys(typeNames).map((id) => [id, 1]));
  for (const type of typeDetails) {
    for (const [key, multiplier] of [['double_damage_from', 2], ['half_damage_from', 0.5], ['no_damage_from', 0]]) {
      if (!Array.isArray(type.damage_relations?.[key])) throw new Error('Ungültige Typdaten von PokéAPI.');
      for (const item of type.damage_relations[key]) {
        if (multipliers.has(item.name)) multipliers.set(item.name, multipliers.get(item.name) * multiplier);
      }
    }
  }
  const weaknesses = [...multipliers].filter(([, value]) => value > 1)
    .map(([id, multiplier]) => ({ ...mapType(id), multiplier }));
  const abilities = pokemon.abilities.map((item, index) => ({
    name: german(abilityDetails[index].names, 'name') || item.ability.name,
    hidden: item.is_hidden,
  }));
  const stats = pokemon.stats.map((item) => ({ id: item.stat.name, value: item.base_stat }));
  const records = [];
  function traverse(item, parent = null) {
    if (!item || !Array.isArray(item.evolves_to)) throw new Error('Ungültige Entwicklungskette von PokéAPI.');
    const id = resourceId(item.species?.url, 'pokemon-species');
    records.push({ id, parent });
    for (const child of item.evolves_to) traverse(child, id);
  }
  traverse(chain.chain);
  if (records.length > 30 || new Set(records.map((item) => item.id)).size !== records.length) {
    throw new Error('Ungültige Entwicklungskette von PokéAPI.');
  }
  const evolutions = await Promise.all(records.map(async (record) => {
    const [evolutionSpecies, evolutionPokemon] = await Promise.all([
      get(`pokemon-species/${record.id}`, fetcher), get(`pokemon/${record.id}`, fetcher),
    ]);
    if (evolutionSpecies.id !== record.id || evolutionPokemon.id !== record.id || !Array.isArray(evolutionPokemon.types)) {
      throw new Error('Ungültige Entwicklungsdaten von PokéAPI.');
    }
    return { ...record, name: german(evolutionSpecies.names, 'name') || evolutionSpecies.name,
      types: evolutionPokemon.types.map((item) => mapType(item.type.name)) };
  }));
  const description = species.flavor_text_entries?.find((item) => item.language?.name === 'de');
  const category = german(species.genera, 'genus')?.trim();
  const cry = pokemon.cries?.latest ?? null;
  if (cry !== null && cry !== `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${dex}.ogg`) {
    throw new Error('Ungültiger Ruf-Verweis von PokéAPI.');
  }
  return {
    dex, description: description ? description.flavor_text.replace(/\s+/g, ' ').trim() : null,
    version: description?.version?.name || null,
    cry,
    category: category ? `${category.replace(/[-\s]+pokémon$/i, '')}-Pokémon` : null,
    height: pokemon.height, weight: pokemon.weight,
    genderRate: species.gender_rate, types, weaknesses, abilities, stats, evolutions,
  };
}
