import { getChineseCard } from './ptcg.js';
import { getCard } from './tcgdex.js';

const englishSetsUrl = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json';
const api = 'https://api.tcgdex.net/v2';

async function json(url, fetcher, allowMissing = false) {
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`Deutsches Ersatzbild konnte nicht gesucht werden: ${error.message}`);
  }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Suche nach deutschem Ersatzbild: HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('Ungültige Antwort bei der Suche nach einem deutschen Ersatzbild.');
  }
}

function numberKey(value) {
  return /^\d+$/.test(value) ? value.replace(/^0+(?=\d)/, '') : value.toUpperCase();
}

function stageKey(stage) {
  const stages = new Map([
    ['basic', 'basic'], ['basis', 'basic'],
    ['stage1', 'stage1'], ['rang 1', 'stage1'],
    ['stage2', 'stage2'], ['rang 2', 'stage2'],
  ]);
  return stages.get(stage.toLocaleLowerCase()) ?? null;
}

export async function findGermanImage(provider, language, id, fetcher = fetch) {
  if (provider === 'tcgdex') {
    const original = await getCard(id, language, fetcher);
    if (language === 'de') return null;
    const german = await json(`${api}/de/cards/${encodeURIComponent(id)}`, fetcher, true);
    if (german) {
      const mapped = await getCard(id, 'de', fetcher);
      if (mapped.image) return { url: mapped.image, label: `${mapped.name} · ${mapped.set} · ${mapped.number}` };
    }

    if (original.dexIds.length !== 1 || !original.illustrator || original.hp === null || !original.stage || !stageKey(original.stage)) return null;
    const query = new URLSearchParams({ illustrator: `eq:${original.illustrator}`, dexId: String(original.dexIds[0]) });
    const candidates = await json(`${api}/de/cards?${query}`, fetcher);
    if (!Array.isArray(candidates)) throw new Error('Ungültige deutsche Kartenliste für Ersatzbild.');
    if (candidates.length > 30) return null;
    const cards = [];
    for (let i = 0; i < candidates.length; i += 5) {
      const batch = await Promise.all(candidates.slice(i, i + 5).map((candidate) => getCard(candidate.id, 'de', fetcher)));
      cards.push(...batch);
    }
    const matched = cards.filter((card) => card.dexIds.length === 1 &&
      card.dexIds[0] === original.dexIds[0] && card.illustrator === original.illustrator &&
      card.hp === original.hp && card.stage && stageKey(card.stage) === stageKey(original.stage));
    if (matched.length !== 1 || !matched[0].image) return null;
    const found = matched[0];
    return { url: found.image, label: `${found.name} · ${found.set} · ${found.number}` };
  }
  if (provider !== 'ptcg' || language !== 'zh-cn') throw new Error('Ungültige Katalogquelle.');
  return findChineseImage(id, 'de', fetcher);
}

async function findChineseImage(id, targetLanguage, fetcher) {
  const original = await getChineseCard(id, fetcher);
  if (!original.englishSetCode || !original.englishNumber) return null;
  const sets = await json(englishSetsUrl, fetcher);
  if (!Array.isArray(sets)) throw new Error('Ungültiger Setindex für deutsches Ersatzbild.');
  const matches = sets.filter((set) => set.ptcgoCode === original.englishSetCode && typeof set.name === 'string');
  if (matches.length !== 1) return null;
  const tcgSets = await json(`${api}/en/sets`, fetcher);
  if (!Array.isArray(tcgSets)) throw new Error('Ungültiger TCGdex-Setindex.');
  const english = tcgSets.filter((set) => set.name === matches[0].name && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/.test(set.id));
  if (english.length !== 1) return null;
  const set = await json(`${api}/${targetLanguage}/sets/${encodeURIComponent(english[0].id)}`, fetcher, true);
  if (!set) return null;
  if (!Array.isArray(set.cards)) throw new Error('Ungültige deutsche Kartenliste.');
  const cards = set.cards.filter((card) => typeof card.localId === 'string' &&
    numberKey(card.localId) === numberKey(original.englishNumber));
  if (cards.length !== 1) return null;
  const found = await getCard(cards[0].id, targetLanguage, fetcher);
  return found.image ? { url: found.image, label: `${found.name} · ${found.set} · ${found.number}` } : null;
}

export async function findBoosterImage(provider, language, id, fetcher = fetch) {
  const german = await findGermanImage(provider, language, id, fetcher);
  if (german) return { ...german, language: 'de' };
  if (provider === 'ptcg') {
    const english = await findChineseImage(id, 'en', fetcher);
    return english ? { ...english, language: 'en' } : null;
  }
  for (const candidateLanguage of ['en', 'ja', 'zh-tw', 'zh-cn', 'ko']) {
    if (candidateLanguage === language) continue;
    const candidate = await json(`${api}/${candidateLanguage}/cards/${encodeURIComponent(id)}`, fetcher, true);
    if (!candidate) continue;
    const card = await getCard(id, candidateLanguage, fetcher);
    if (card.image) {
      return { url: card.image, label: `${card.name} · ${card.set} · ${card.number}`, language: candidateLanguage };
    }
  }
  return null;
}
