const base = 'https://raw.githubusercontent.com/zsjy947/PTCG-card-data/master/data';
const validId = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;

async function get(path, fetcher) {
  let response;
  try {
    response = await fetcher(`${base}/${path}`, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`PTCG-card-data ist nicht erreichbar: ${error.message}`);
  }
  if (!response.ok) throw new Error(`PTCG-card-data meldet HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new Error('PTCG-card-data hat ungültige Daten geliefert.');
  }
}

function normalize(value) {
  return value.trim().toLocaleLowerCase('de');
}

function numberKey(value) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, '') : trimmed.toUpperCase();
}

async function index(fetcher) {
  const sets = await get('sets_index.json', fetcher);
  if (!Array.isArray(sets) || sets.some((s) => !s || !validId.test(s.id) || typeof s.name !== 'string')) {
    throw new Error('Ungültiger Setindex von PTCG-card-data.');
  }
  return sets;
}

function mapCard(card, set) {
  if (!card || card.setCode !== set.id && card.setCode !== set.code ||
      typeof card.cardIndex !== 'string' || !validId.test(card.cardIndex) ||
      typeof card.cardName !== 'string') throw new Error('Ungültige Kartendaten von PTCG-card-data.');
  return {
    id: `${set.id}:${card.cardIndex}`,
    name: card.nameEn ? `${card.cardName} (${card.nameEn})` : card.cardName,
    set: set.name,
    number: card.cardIndex,
    image: null,
    language: 'zh-cn',
    dexIds: [],
    englishName: typeof card.nameEn === 'string' ? card.nameEn : null,
    officialTotal: null,
    provider: 'ptcg',
    suffixVerified: false,
    englishSetCode: typeof card.setCodeEn === 'string' ? card.setCodeEn : null,
    englishNumber: typeof card.cardIndexEn === 'string' ? card.cardIndexEn : null,
  };
}

async function cardsFor(set, fetcher) {
  const cards = await get(`cards/${encodeURIComponent(set.id)}.json`, fetcher);
  if (!Array.isArray(cards)) throw new Error('Ungültige Kartenliste von PTCG-card-data.');
  return cards;
}

export async function searchChineseCards(set, number, page = 1, fetcher = fetch) {
  if (typeof set !== 'string' || set.length > 200 || typeof number !== 'string' ||
      number.length > 100 || !/^[\p{L}\d._-]+(?:\s*\/\s*\d+)?$/u.test(number.trim())) {
    throw new Error('Bitte eine gültige Kartennummer eingeben, z. B. 0901/07.');
  }
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new Error('Ungültige Suchseite.');
  const [part, suffix] = number.trim().split(/\s*\/\s*/);
  const sets = (await index(fetcher)).filter((item) => !set.trim() ||
    normalize(item.name).includes(normalize(set)) || normalize(item.id).includes(normalize(set)));
  if (/^\d{4}$/.test(part) && suffix && numberKey(suffix) === '7') {
    sets.sort((a, b) => Number(/^CBB\d+C$/i.test(b.id)) - Number(/^CBB\d+C$/i.test(a.id)));
  }
  const batch = sets.slice((page - 1) * 15, page * 15);
  const cards = [];
  for (let i = 0; i < batch.length; i += 5) {
    const chunk = batch.slice(i, i + 5);
    const lists = await Promise.all(chunk.map((item) => cardsFor(item, fetcher)));
    for (const [j, list] of lists.entries()) {
      for (const item of list) {
        if (typeof item.cardIndex === 'string' && numberKey(item.cardIndex) === numberKey(part)) {
          cards.push(mapCard(item, chunk[j]));
        }
      }
    }
  }
  return { cards, page, totalSets: sets.length, hasMore: page * 15 < sets.length };
}

export async function getChineseCard(id, fetcher = fetch) {
  if (typeof id !== 'string') throw new Error('Ungültige PTCG-Karten-ID.');
  const parts = id.split(':');
  if (parts.length !== 2 || !validId.test(parts[0]) || !validId.test(parts[1])) {
    throw new Error('Ungültige PTCG-Karten-ID.');
  }
  const set = (await index(fetcher)).find((item) => item.id === parts[0]);
  if (!set) throw new Error('Set nicht in PTCG-card-data gefunden.');
  const card = (await cardsFor(set, fetcher)).find((item) => item.cardIndex === parts[1]);
  if (!card) throw new Error('Karte nicht in PTCG-card-data gefunden.');
  return mapCard(card, set);
}
