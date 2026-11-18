import { searchCards } from './tcgdex.js';
import { searchChineseCards } from './ptcg.js';

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
  return { cards, page, totalSets, hasMore, warnings };
}
