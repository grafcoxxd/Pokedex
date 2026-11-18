function normalize(value) {
  return value.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Fallback für Karten ohne Dex-Angabe im Katalog: deutsche Pokémon-Namen im Kartennamen suchen.
function resolveByName(card, names) {
  if (card.language !== 'de' || typeof card.name !== 'string' || !Array.isArray(names)) return [];
  const byName = new Map(names.map((item) => [normalize(item.name), item.dex]));
  const tokens = normalize(card.name).split(/[^\p{L}\d]+/u).filter(Boolean);
  return [...new Set(tokens.filter((token) => byName.has(token)).map((token) => byName.get(token)))];
}

export async function resolvePokemon(card, fetcher = fetch, names = []) {
  const dexIds = [...new Set(card.dexIds)];
  if (dexIds.length) return { dexIds, source: 'catalog' };
  const named = resolveByName(card, names);
  if (named.length) return { dexIds: named, source: 'name' };
  if (card.provider !== 'ptcg' || typeof card.englishName !== 'string' ||
      !/^[A-Za-z]+$/.test(card.englishName)) return { dexIds: [], source: null };
  let response;
  try {
    response = await fetcher(`https://pokeapi.co/api/v2/pokemon-species/${card.englishName.toLowerCase()}`,
      { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`Pokémon-Zuordnung über PokéAPI fehlgeschlagen: ${error.message}`);
  }
  if (response.status === 404) return { dexIds: [], source: null };
  if (!response.ok) throw new Error(`Pokémon-Zuordnung über PokéAPI: HTTP ${response.status}.`);
  let species;
  try {
    species = await response.json();
  } catch {
    throw new Error('Ungültige Antwort von PokéAPI bei der Pokémon-Zuordnung.');
  }
  if (!Number.isInteger(species?.id) || species.id < 1 || !Array.isArray(species.names)) {
    throw new Error('Ungültige Pokémon-Daten von PokéAPI.');
  }
  const matches = species.names.filter((name) => name?.language?.name === 'en' &&
    typeof name.name === 'string' && name.name.toLowerCase() === card.englishName.toLowerCase());
  return matches.length === 1 ? { dexIds: [species.id], source: 'pokeapi' } : { dexIds: [], source: null };
}
