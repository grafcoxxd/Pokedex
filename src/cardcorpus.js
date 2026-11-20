import { getSetCards } from './tcgdex.js';

const root = 'https://raw.githubusercontent.com/cardcorpus/pokemon-card-dataset/main/v1';
const tcg = 'https://api.tcgdex.net/v2';
const catalogs = { ja: 'japanese', 'zh-cn': 'zh-hans' };
const setIdPattern = /^(?:japanese|zh-hans|international)\/[a-z0-9][a-z0-9-]*$/;

async function json(url, fetcher) {
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`CardCorpus ist nicht erreichbar: ${error.message}`);
  }
  if (!response.ok) throw new Error(`CardCorpus-Datenabfrage meldet HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('Ungültige Antwort bei der Karten-Zuordnung.');
  }
}

function numberKey(value) {
  if (typeof value !== 'string') return null;
  const number = value.trim();
  return /^\d+$/.test(number) ? number.replace(/^0+(?=\d)/, '') : number.toUpperCase();
}

function uniqueNumber(cards, number, getNumber) {
  const key = numberKey(number);
  if (!key) return null;
  const matches = cards.filter((card) => numberKey(getNumber(card)) === key);
  return matches.length === 1 ? matches[0] : null;
}

function nameKey(value) {
  return value.trim().toLocaleLowerCase('en');
}

export async function enrichBoosterSet(result, setCode, language, fetcher = fetch) {
  const catalog = catalogs[language];
  if (!catalog || !result.cards.length) return result;

  const index = await json(`${root}/sets.json`, fetcher);
  if (!Array.isArray(index.sets)) throw new Error('Ungültige CardCorpus-Setliste.');
  const matches = index.sets.filter((set) => set.catalog === catalog &&
    typeof set.code === 'string' && set.code.toUpperCase() === setCode.toUpperCase() &&
    typeof set.id === 'string' && setIdPattern.test(set.id));
  if (matches.length !== 1) return result;

  const source = await json(`${root}/sets/${matches[0].id}.json`, fetcher);
  if (source.id !== matches[0].id || !Array.isArray(source.cards)) throw new Error('Ungültige CardCorpus-Kartenliste.');
  const mapped = result.cards.map((card) => ({
    card,
    source: uniqueNumber(source.cards, card.number, (candidate) => candidate?.number?.numerator),
  }));
  const warnings = [];
  const referencedSets = new Set();
  for (const { source: card } of mapped) {
    const links = card?.links?.counterparts?.international;
    if (!Array.isArray(links) || links.length !== 1) continue;
    const link = links[0];
    if (link.$kind === 'card' && link.language === 'en' &&
        typeof link.set === 'string' && setIdPattern.test(link.set) && link.set.startsWith('international/') &&
        typeof link.card === 'string') referencedSets.add(link.set);
  }

  const germanSets = new Map();
  if (referencedSets.size) {
    try {
      const englishSets = await json(`${tcg}/en/sets`, fetcher);
      if (!Array.isArray(englishSets)) throw new Error('Ungültige englische TCGdex-Setliste.');
      for (const reference of referencedSets) {
        const indexed = index.sets.filter((set) => set.id === reference && typeof set.name === 'string');
        if (indexed.length !== 1) continue;
        const matching = englishSets.filter((set) => typeof set.name === 'string' &&
          nameKey(set.name) === nameKey(indexed[0].name) &&
          typeof set.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/.test(set.id));
        if (matching.length !== 1) continue;
        try {
          const german = await getSetCards(matching[0].id, 'de', fetcher, true);
          if (german) germanSets.set(reference, german);
        } catch (error) {
          warnings.push(`Deutsche Kartennamen: ${error.message}`);
        }
      }
    } catch (error) {
      warnings.push(`Deutsche Kartennamen: ${error.message}`);
    }
  }

  const cards = mapped.map(({ card, source: entry }) => {
    if (!entry) return card;
    const imageId = entry.picture?.front?.image;
    const corpusImage = typeof imageId === 'string' && /^[a-f0-9]{32}$/.test(imageId)
      ? `https://img.cardcorpus.com/s1/480/${imageId}.avif` : null;
    const links = entry.links?.counterparts?.international;
    const link = Array.isArray(links) && links.length === 1 ? links[0] : null;
    const germanSet = link?.$kind === 'card' && link.language === 'en' ? germanSets.get(link.set) : null;
    const german = germanSet && uniqueNumber(germanSet.cards, link.card, (candidate) => candidate.number);
    return {
      ...card,
      ...(corpusImage ? { corpusImage } : {}),
      ...(german ? { germanName: german.name } : {}),
    };
  });
  const translations = new Map();
  for (const [index, card] of cards.entries()) {
    const sourceName = mapped[index].source?.name;
    if (!card.germanName || typeof sourceName !== 'string' || !sourceName.trim()) continue;
    const key = JSON.stringify([card.name, sourceName]);
    if (!translations.has(key)) translations.set(key, new Set());
    translations.get(key).add(card.germanName);
  }
  for (const [index, card] of cards.entries()) {
    const sourceName = mapped[index].source?.name;
    if (card.germanName || typeof sourceName !== 'string' || !sourceName.trim()) continue;
    const names = translations.get(JSON.stringify([card.name, sourceName]));
    if (names?.size === 1) card.germanName = names.values().next().value;
  }
  return { ...result, cards, warnings };
}
