import { scoreSet } from './set-matching.js';

const API = 'https://api.tcgdex.net/v2';
const languages = new Set(['de', 'en', 'ja', 'ko', 'zh-tw', 'zh-cn']);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/;

function language(value) {
  if (!languages.has(value)) throw new Error('Diese Kartensprache wird nicht unterstützt.');
  return value;
}

function cleanImage(image) {
  if (typeof image !== 'string') return null;
  try {
    const url = new URL(image);
    if (url.protocol !== 'https:' || url.hostname !== 'assets.tcgdex.net' ||
        url.username || url.password || url.port || url.search || url.hash ||
        !/^\/(?:[a-zA-Z0-9_.+%-]+\/){3}[a-zA-Z0-9_.+%-]+$/.test(url.pathname)) return null;
    return `${url.href}/low.webp`;
  } catch {
    return null;
  }
}

async function get(path, fetcher, allowMissing = false) {
  let response;
  try {
    response = await fetcher(`${API}/${path}`, { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`TCGdex ist nicht erreichbar: ${error.message}`);
  }
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`TCGdex meldet HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('TCGdex hat eine ungültige Antwort geliefert.');
  }
}

function normalize(value) {
  return value.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
}

function normalizeNumber(value) {
  const number = value.trim();
  return /^\d+$/.test(number) ? number.replace(/^0+(?=\d)/, '') : number.toUpperCase();
}

async function findPrintedCodeSets(set, lang, sets, fetcher) {
  if (lang !== 'de' && lang !== 'en') return [];
  const match = set.trim().match(/^([a-z0-9]{2,6})(?:\s+(de|en))?$/i);
  if (!match || (match[2] && match[2].toLowerCase() !== lang)) return [];
  let response;
  try {
    response = await fetcher(`https://api.pokemontcg.io/v2/sets?q=${encodeURIComponent(`ptcgoCode:${match[1].toUpperCase()}`)}`,
      { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    throw new Error(`Setkürzel-Suche ist nicht erreichbar: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Setkürzel-Suche meldet HTTP ${response.status}.`);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Setkürzel-Suche hat eine ungültige Antwort geliefert.');
  }
  if (!Array.isArray(payload.data)) throw new Error('Ungültige Setliste für Setkürzel.');
  const names = new Set(payload.data
    .filter((item) => typeof item.name === 'string' && typeof item.ptcgoCode === 'string' &&
      item.ptcgoCode.toUpperCase() === match[1].toUpperCase())
    .map((item) => normalize(item.name)));
  if (!names.size) return [];
  const englishSets = lang === 'en' ? sets : await get('en/sets', fetcher);
  if (!Array.isArray(englishSets)) throw new Error('Ungültige englische Setliste von TCGdex.');
  const ids = new Set(englishSets
    .filter((item) => typeof item.name === 'string' && idPattern.test(item.id) && names.has(normalize(item.name)))
    .map((item) => item.id));
  return sets.filter((item) => item && typeof item.name === 'string' && ids.has(item.id));
}

async function matchingSets(set, lang, fetcher, similar = false) {
  const sets = await get(`${lang}/sets`, fetcher);
  if (!Array.isArray(sets)) throw new Error('Ungültige Setliste von TCGdex.');
  if (similar) {
    const ranked = sets.filter((item) => item && typeof item.name === 'string' && idPattern.test(item.id))
      .map((item) => ({ item, score: scoreSet(set, item.name, [item.id]) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((match) => match.item);
    if (ranked.length) return ranked;
    return findPrintedCodeSets(set, lang, sets, fetcher);
  }
  let matches = sets.filter((item) => item && typeof item.name === 'string' && idPattern.test(item.id) &&
    (!set.trim() || normalize(item.name).includes(normalize(set)) || normalize(item.id) === normalize(set)));
  if (!matches.length) matches = await findPrintedCodeSets(set, lang, sets, fetcher);
  return matches;
}

export async function searchSets(set, lang, page = 1, fetcher = fetch) {
  language(lang);
  if (typeof set !== 'string' || !set.trim() || set.length > 200) {
    throw new Error('Bitte einen Setnamen oder ein Setkürzel eingeben.');
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Ungültige Suchseite.');
  const matches = await matchingSets(set, lang, fetcher, true);
  return {
    sets: matches.slice((page - 1) * 15, page * 15).map((item) => ({
      id: item.id, name: item.name, provider: 'tcgdex', language: lang,
    })),
    totalSets: matches.length,
    hasMore: page * 15 < matches.length,
  };
}

export async function getSetCards(id, lang, fetcher = fetch, allowMissing = false) {
  language(lang);
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Ungültige TCGdex-Set-ID.');
  const detail = await get(`${lang}/sets/${encodeURIComponent(id)}`, fetcher, allowMissing);
  if (detail === null) return null;
  if (detail.id !== id || typeof detail.name !== 'string' || !Array.isArray(detail.cards)) {
    throw new Error('Ungültige Setdaten von TCGdex.');
  }
  const cards = detail.cards.map((card) => {
    if (!card || typeof card.localId !== 'string' || typeof card.name !== 'string' || !idPattern.test(card.id)) {
      throw new Error('Ungültige Kartenliste von TCGdex.');
    }
    return { id: card.id, name: card.name, number: card.localId, image: cleanImage(card.image) };
  });
  return { name: detail.name, cards, total: Number.isInteger(detail.cardCount?.total) ? detail.cardCount.total : null };
}

export async function searchCards(set, number, lang, fetcher = fetch, page = 1) {
  language(lang);
  if (set === null) set = '';
  if (typeof set !== 'string' || set.length > 200 ||
      typeof number !== 'string' || number.length > 100 ||
      !/^[\p{L}\d._-]+(?:\s*\/\s*\d+)?$/u.test(number.trim())) {
    throw new Error('Bitte eine gültige Kartennummer eingeben, z. B. 001/189 oder TG12.');
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Ungültige Suchseite.');
  const [localNumber, printedTotal] = number.trim().split(/\s*\/\s*/);
  const matches = await matchingSets(set, lang, fetcher);
  const limited = matches.slice((page - 1) * 15, page * 15);
  const details = [];
  for (let i = 0; i < limited.length; i += 5) {
    details.push(...await Promise.all(limited.slice(i, i + 5)
      .map((item) => get(`${lang}/sets/${encodeURIComponent(item.id)}`, fetcher))));
  }
  const cards = [];
  for (const [index, detail] of details.entries()) {
    if (!Array.isArray(detail.cards)) throw new Error('Ungültige Kartenliste von TCGdex.');
    for (const card of detail.cards) {
      const localParts = typeof card.localId === 'string' ? card.localId.trim().split(/\s*\/\s*/) : [];
      if (typeof card.localId !== 'string' || typeof card.name !== 'string' || !idPattern.test(card.id) ||
          localParts.length > 2 || normalizeNumber(localParts[0]) !== normalizeNumber(localNumber) ||
          (printedTotal && localParts.length === 2 && normalizeNumber(localParts[1]) !== normalizeNumber(printedTotal))) continue;
      cards.push({ id: card.id, name: card.name, number: card.localId,
        set: limited[index].name, setId: limited[index].id,
        officialTotal: localParts.length === 2 ? null : (limited[index].cardCount?.official ?? null),
        suffixVerified: Boolean(printedTotal && localParts.length === 2),
        image: cleanImage(card.image), language: lang });
    }
  }
  return { cards, page, totalSets: matches.length, hasMore: page * 15 < matches.length };
}

export async function getCard(id, lang, fetcher = fetch) {
  language(lang);
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Ungültige TCGdex-Karten-ID.');
  const card = await get(`${lang}/cards/${encodeURIComponent(id)}`, fetcher);
  if (card.id !== id || typeof card.name !== 'string' || typeof card.localId !== 'string' ||
      !card.set || typeof card.set.name !== 'string') throw new Error('Ungültige Kartendaten von TCGdex.');
  return { id, language: lang, name: card.name, image: cleanImage(card.image),
    set: card.set.name, setId: typeof card.set.id === 'string' && idPattern.test(card.set.id) ? card.set.id : null,
    number: card.localId,
    dexIds: Array.isArray(card.dexId) ? card.dexId.filter(Number.isInteger) : [],
    illustrator: typeof card.illustrator === 'string' ? card.illustrator : null,
    hp: typeof card.hp === 'number' ? card.hp : null,
    stage: typeof card.stage === 'string' ? card.stage : null };
}
