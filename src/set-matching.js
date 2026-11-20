function normalize(value) {
  return value.toLocaleLowerCase('de').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

export function scoreSet(query, name, codes = []) {
  const search = normalize(query);
  if (!search) return 0;
  const normalizedName = normalize(name);
  const normalizedCodes = codes.filter((code) => typeof code === 'string').map(normalize);
  if (normalizedCodes.includes(search)) return 10000;
  if (normalizedName === search) return 9000;
  if (normalizedName.includes(search)) return 8000;
  if (normalizedCodes.some((code) => code.includes(search))) return 7000;

  const words = normalizedName.split(' ').filter(Boolean);
  let score = 0;
  for (const term of search.split(' ')) {
    let best = 0;
    for (const word of words) {
      if (word === term) best = Math.max(best, 30);
      else if (word.startsWith(term)) best = Math.max(best, 20);
      else if (word.includes(term)) best = Math.max(best, 10);
      else if (term.length >= 4 && term.length <= 32 && word.length <= 32) {
        const maxDistance = term.length >= 8 ? 2 : 1;
        if (Math.abs(term.length - word.length) <= maxDistance) {
          const distance = editDistance(term, word);
          if (distance <= maxDistance) best = Math.max(best, 6 - distance);
        }
      }
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}
