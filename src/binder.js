import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BINDER_NAMES = new Map([
  [1, 'Kanto'],
  [2, 'Johto'],
  [3, 'Hoenn'],
  [4, 'Sinnoh'],
]);

export const BINDER_CAPACITY = 40 * 9;

export function validate(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.binders) || !Array.isArray(data.cards)) {
    throw new Error('Ungültiges Datenbankformat.');
  }
  const binders = new Set();
  const homes = new Map();
  const references = [];
  for (const binder of data.binders) {
    if (!BINDER_NAMES.has(binder.id) || binder.name !== BINDER_NAMES.get(binder.id) ||
        binders.has(binder.id) || !Array.isArray(binder.entries)) {
      throw new Error('Ungültiger oder doppelter Binder.');
    }
    binders.add(binder.id);
    const seen = new Set();
    for (const entry of binder.entries) {
      if (!Number.isInteger(entry.dex) || entry.dex < 1 || typeof entry.name !== 'string' ||
          !entry.name.trim() || !['home', 'placeholder'].includes(entry.kind) || seen.has(entry.dex)) {
        throw new Error(`Ungültiger oder doppelter Eintrag in ${binder.name}.`);
      }
      seen.add(entry.dex);
      if (entry.kind === 'home') {
        if (homes.has(entry.dex)) throw new Error(`Mehrere Heimat-Binder für #${entry.dex}.`);
        homes.set(entry.dex, { binder, entry });
      } else {
        references.push({ binder, entry });
      }
    }
  }
  for (const { binder, entry } of references) {
    const home = homes.get(entry.dex);
    if (!home || home.binder.id === binder.id || home.entry.name !== entry.name) {
      throw new Error(`Ungültiger Platzhalter für #${entry.dex} in ${binder.name}.`);
    }
  }
  const ids = new Set();
  for (const card of data.cards) {
    if (!card || typeof card.id !== 'string' || !card.id.trim() || ids.has(card.id) ||
        !homes.has(card.dex) || typeof card.set !== 'string' || !card.set.trim() ||
        typeof card.number !== 'string' || !card.number.trim()) {
      throw new Error('Ungültige oder doppelte Karte.');
    }
    if (card.tcgdex !== undefined && (!card.tcgdex || typeof card.tcgdex.id !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9_.+-]{0,99}$/.test(card.tcgdex.id) || !['de', 'en', 'ja', 'ko', 'zh-tw', 'zh-cn'].includes(card.tcgdex.language) ||
        typeof card.tcgdex.name !== 'string' ||
        (card.tcgdex.image !== null && (typeof card.tcgdex.image !== 'string' ||
          !/^https:\/\/assets\.tcgdex\.net\/(?:[a-zA-Z0-9_.+%-]+\/){4}low\.webp$/.test(card.tcgdex.image))))) {
      throw new Error('Ungültige TCGdex-Kartenverknüpfung.');
    }
    if (card.ptcg !== undefined && (!card.ptcg || typeof card.ptcg.id !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}:[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(card.ptcg.id) ||
        card.ptcg.language !== 'zh-cn' || typeof card.ptcg.name !== 'string' || card.ptcg.image !== null)) {
      throw new Error('Ungültige PTCG-Kartenverknüpfung.');
    }
    if (card.tcgdex && card.ptcg) throw new Error('Karte hat mehrere Katalogverknüpfungen.');
    if (card.cardLanguage !== undefined && !['de', 'en', 'ja', 'ko', 'zh-tw', 'zh-cn'].includes(card.cardLanguage)) {
      throw new Error('Ungültige Kartensprache.');
    }
    ids.add(card.id);
  }
  return data;
}

export async function loadDatabase(path) {
  return validate(JSON.parse(await readFile(path, 'utf8')));
}

export async function saveDatabase(path, data, { create = false } = {}) {
  validate(data);
  const content = `${JSON.stringify(data, null, 2)}\n`;
  if (create) {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
    return;
  }
  const temporary = join(dirname(path), `.binder-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    const { unlink } = await import('node:fs/promises');
    await unlink(temporary).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') {
        console.error(`Temporäre Datei konnte nicht entfernt werden: ${cleanupError.message}`);
      }
    });
    throw error;
  }
}

export function positions(data) {
  validate(data);
  const cardGroups = new Map();
  for (const card of data.cards) {
    const cards = cardGroups.get(card.dex) ?? [];
    cards.push(card);
    cardGroups.set(card.dex, cards);
  }
  return data.binders.map((binder) => {
    let position = 0;
    return {
      id: binder.id,
      name: binder.name,
      entries: binder.entries.map((entry) => {
        const cards = entry.kind === 'home' ? (cardGroups.get(entry.dex) ?? []) : [];
        const start = position;
        const count = Math.max(1, cards.length);
        position += count;
        const slots = Array.from({ length: count }, (_, index) => {
          const offset = start + index;
          return {
            page: Math.floor(offset / 9) + 1,
            slot: offset % 9 + 1,
            card: cards[index] ?? null,
          };
        });
        return { ...entry, slots };
      }),
    };
  });
}

function normalize(text) {
  return text.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function search(data, query) {
  const term = String(query).trim();
  if (!term) throw new Error('Bitte einen Namen oder eine National-Dex-Nummer angeben.');
  const numeric = /^#?\d+$/.test(term);
  const dex = numeric ? Number(term.replace(/^#/, '')) : null;
  const all = positions(data);
  const matches = [];
  for (const binder of all) {
    for (const entry of binder.entries) {
      if (entry.kind !== 'home' || (numeric ? entry.dex !== dex : !normalize(entry.name).includes(normalize(term)))) {
        continue;
      }
      const placeholders = all.flatMap((other) =>
        other.entries.filter((item) => item.kind === 'placeholder' && item.dex === entry.dex)
          .map((item) => ({ binder: other.name, ...item.slots[0] })));
      matches.push({ dex: entry.dex, name: entry.name, homeBinder: binder.name, slots: entry.slots, placeholders });
    }
  }
  return matches;
}

export function addCard(data, dex, set, number, cardLanguage) {
  validate(data);
  const home = data.binders.find((binder) =>
    binder.entries.some((entry) => entry.kind === 'home' && entry.dex === dex));
  if (!Number.isInteger(dex) || !home) {
    throw new Error(`Kein Pokémon mit National-Dex-Nummer ${dex} vorhanden.`);
  }
  if (typeof set !== 'string' || !set.trim() || typeof number !== 'string' || !number.trim()) {
    throw new Error('Set und Kartennummer müssen angegeben werden.');
  }
  if (cardLanguage !== undefined && !['de', 'en', 'ja', 'ko', 'zh-tw', 'zh-cn'].includes(cardLanguage)) {
    throw new Error('Ungültige Kartensprache.');
  }
  const occupied = positions(data).find((binder) => binder.id === home.id)
    .entries.reduce((sum, entry) => sum + entry.slots.length, 0);
  const addsSlot = data.cards.some((card) => card.dex === dex);
  if (addsSlot && occupied >= BINDER_CAPACITY) {
    throw new Error(`${home.name} hat keine freien Fächer mehr (40 Seiten, 360 Fächer).`);
  }
  const card = { id: randomUUID(), dex, set: set.trim(), number: number.trim() };
  if (cardLanguage !== undefined) card.cardLanguage = cardLanguage;
  data.cards.push(card);
  return card;
}

export function removeCard(data, id) {
  validate(data);
  const index = data.cards.findIndex((card) => card.id === id);
  if (index < 0) throw new Error(`Karte ${id} nicht gefunden.`);
  return data.cards.splice(index, 1)[0];
}

export function linkCard(data, id, catalogCard, cardLanguage) {
  validate(data);
  const card = data.cards.find((item) => item.id === id);
  if (!card) throw new Error(`Karte ${id} nicht gefunden.`);
  const key = catalogCard.provider === 'ptcg' ? 'ptcg' : 'tcgdex';
  const previous = { tcgdex: card.tcgdex, ptcg: card.ptcg, cardLanguage: card.cardLanguage };
  delete card.tcgdex;
  delete card.ptcg;
  card[key] = { id: catalogCard.id, language: catalogCard.language,
    name: catalogCard.name, image: catalogCard.image };
  if (cardLanguage !== undefined) card.cardLanguage = cardLanguage;
  try {
    validate(data);
  } catch (error) {
    delete card[key];
    if (previous.tcgdex !== undefined) card.tcgdex = previous.tcgdex;
    if (previous.ptcg !== undefined) card.ptcg = previous.ptcg;
    if (previous.cardLanguage === undefined) delete card.cardLanguage;
    else card.cardLanguage = previous.cardLanguage;
    throw error;
  }
  return card;
}
