import { getCard, getSetCards, searchCards, searchSets } from './tcgdex.js';
import { getChineseCard, getChineseSetCards, hasChineseSetCards, searchChineseCards, searchChineseSets } from './ptcg.js';
import { enrichBoosterSet } from './cardcorpus.js';

async function enrich(result, id, language, fetcher) {
  try {
    return await enrichBoosterSet(result, id, language, fetcher);
  } catch (error) {
    return { ...result, warnings: [`CardCorpus: ${error.message}`] };
  }
}

async function setHasCards(item, fetcher) {
  if (item.provider === 'ptcg') return hasChineseSetCards(item.id, fetcher);
  const detail = await getSetCards(item.id, item.language, fetcher);
  if (detail.cards.length) return true;
  if (item.language !== 'ko') return false;
  const comparison = await getSetCards(item.id, 'ja', fetcher, true);
  return Boolean(comparison && comparison.cards.length);
}

async function availableSets(source, page, fetcher) {
  const available = [];
  const warnings = [];
  let rawPage = 1;
  let more = true;
  while (more && available.length <= page * 15) {
    const result = await source.search(rawPage++);
    more = result.hasMore;
    for (let i = 0; i < result.sets.length; i += 5) {
      const batch = result.sets.slice(i, i + 5);
      const checks = await Promise.allSettled(batch.map((item) => setHasCards(item, fetcher)));
      for (const [index, check] of checks.entries()) {
        if (check.status === 'fulfilled') {
          if (check.value) available.push(batch[index]);
        } else {
          available.push(batch[index]);
          warnings.push(`${source.name}, ${batch[index].name}: Kartenliste konnte nicht geprüft werden: ${check.reason.message}`);
        }
      }
    }
  }
  return { sets: available.slice((page - 1) * 15, page * 15),
    hasMore: available.length > page * 15 || more, warnings };
}

export async function searchBoosterSets(set, language, page = 1, fetcher = fetch) {
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Ungültige Suchseite.');
  const sources = [{ name: 'TCGdex', search: (rawPage) => searchSets(set, language, rawPage, fetcher) }];
  if (language === 'zh-cn') sources.push({ name: 'PTCG-card-data', search: (rawPage) => searchChineseSets(set, rawPage, fetcher) });
  if (language === 'ko') sources.push({
    name: 'TCGdex (japanischer Vergleich)',
    search: async (rawPage) => {
      const result = await searchSets(set, 'ja', rawPage, fetcher);
      return { ...result, sets: result.sets.map((item) => ({ ...item, comparison: true })) };
    },
  });
  const results = await Promise.allSettled(sources.map((source) => availableSets(source, page, fetcher)));
  const sets = [];
  const warnings = [];
  let hasMore = false;
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      warnings.push(`${sources[index].name}: ${result.reason.message}`);
    } else {
      sets.push(...result.value.sets);
      hasMore ||= result.value.hasMore;
      warnings.push(...result.value.warnings);
    }
  }
  if (results.every((result) => result.status === 'rejected')) throw new Error(warnings.join(' '));
  return { sets, page, hasMore, warnings };
}

export async function getBoosterSet(id, language, provider, fetcher = fetch) {
  if (provider === 'tcgdex') {
    const result = await getSetCards(id, language, fetcher);
    if (language === 'ko' && !result.cards.length) {
      const comparison = await getSetCards(id, 'ja', fetcher, true);
      if (comparison && comparison.cards.length) {
        return enrich({ ...comparison, comparison: true, originalName: result.name }, id, 'ja', fetcher);
      }
    }
    return enrich(result, id, language, fetcher);
  }
  if (provider === 'ptcg' && language === 'zh-cn') {
    return enrich(await getChineseSetCards(id, fetcher), id, language, fetcher);
  }
  throw new Error('Ungültige Katalogquelle oder Kartensprache.');
}

export async function getCardCorpusExtra(id, language, provider, fetcher = fetch) {
  if (!['ja', 'zh-cn'].includes(language)) throw new Error('Diese Kartensprache wird von CardCorpus nicht unterstützt.');
  const original = provider === 'tcgdex' ? await getCard(id, language, fetcher)
    : provider === 'ptcg' && language === 'zh-cn' ? await getChineseCard(id, fetcher) : null;
  if (!original) throw new Error('Ungültige Katalogquelle oder Kartensprache.');
  if (!original.setId) throw new Error('Die Quelle meldet keine gültige Set-ID für die CardCorpus-Zuordnung.');
  const result = await getBoosterSet(original.setId, language, provider, fetcher);
  const matches = result.cards.filter((card) => card.id === id);
  return { card: matches.length === 1 ? matches[0] : null, warnings: result.warnings || [] };
}

export async function searchCatalog(set, number, language, page = 1, fetcher = fetch) {
  if (typeof set !== 'string' || !set.trim()) throw new Error('Bitte einen Setnamen oder ein Setkürzel eingeben.');
  const sources = [{ name: 'TCGdex', provider: 'tcgdex', language }];
  if (language === 'zh-cn') sources.push({ name: 'PTCG-card-data', provider: 'ptcg', language });
  if (language === 'ko') sources.push({ name: 'TCGdex (japanischer Vergleich)', provider: 'tcgdex', language: 'ja', comparison: true });

  const results = await Promise.allSettled(sources.map((source) => source.provider === 'ptcg'
    ? searchChineseCards(set, number, page, fetcher)
    : searchCards(set, number, source.language, fetcher, page)));
  const cards = [];
  const warnings = [];
  let totalSets = 0;
  let hasMore = false;
  for (const [index, result] of results.entries()) {
    const source = sources[index];
    if (result.status === 'rejected') {
      warnings.push(`${source.name}: ${result.reason.message}`);
      continue;
    }
    totalSets += result.value.totalSets;
    hasMore ||= result.value.hasMore;
    cards.push(...result.value.cards.map((card) => ({
      ...card, provider: source.provider, comparison: Boolean(source.comparison),
    })));
  }
  if (warnings.length === sources.length) throw new Error(warnings.join(' '));
  const groups = new Map();
  for (const card of cards) {
    if (!['ja', 'zh-cn'].includes(card.language) || !card.setId) continue;
    const key = JSON.stringify([card.provider, card.language, card.setId]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const batches = [...groups.values()];
  for (let i = 0; i < batches.length; i += 3) {
    await Promise.all(batches.slice(i, i + 3).map(async (group) => {
      try {
        const { provider, language: lang, setId } = group[0];
        const detail = await getBoosterSet(setId, lang, provider, fetcher);
        warnings.push(...(detail.warnings || []));
        for (const card of group) {
          const matches = detail.cards.filter((entry) => entry.id === card.id);
          if (matches.length !== 1) continue;
          if (matches[0].corpusImage) card.corpusImage = matches[0].corpusImage;
          if (matches[0].germanName) card.germanName = matches[0].germanName;
        }
      } catch (error) {
        warnings.push(`CardCorpus: ${error.message}`);
      }
    }));
  }
  return { cards, page, totalSets, hasMore, warnings };
}
