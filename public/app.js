const $ = (selector) => document.querySelector(selector);
let binders = [];
let capacity = 360;
let selected = 1;
let page = 1;
const pageSize = 24;
const colors = ['#d96f58', '#d2a655', '#5a9f91', '#8576ad'];

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, className, action) {
  const result = node('button', className, text);
  result.type = 'button';
  result.addEventListener('click', action);
  return result;
}

function notify(text, error = false) {
  const message = $('#message');
  message.textContent = text;
  message.className = error ? 'show error' : 'show';
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { message.className = ''; }, 5000);
}

async function request(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Anfrage fehlgeschlagen (${response.status}).`);
  return data;
}

async function refresh() {
  const data = await request('/api/binders');
  binders = data.binders;
  capacity = data.capacity;
  render();
}

function home(dex) {
  for (const binder of binders) {
    const entry = binder.entries.find((item) => item.dex === dex && item.kind === 'home');
    if (entry) return { binder, entry };
  }
}

function owned(dex) {
  const target = home(dex);
  return Boolean(target) && target.entry.slots.some((slot) => slot.card);
}

function formatSlot(slot) {
  return `Seite ${slot.page} · Fach ${slot.slot}`;
}

function countCards(binder) {
  return binder.entries.reduce((sum, entry) => sum + entry.slots.filter((slot) => slot.card).length, 0);
}

function normalize(value) {
  return value.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function pokemonSprite(dex, placeholder, hidden) {
  const icon = node('span', `result-icon${placeholder ? ' placeholder-icon' : ''}${hidden ? ' silhouette' : ''}`);
  const image = node('img');
  const base = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
  const fallback = `${base}/${dex}.png`;
  image.alt = '';
  image.addEventListener('error', () => {
    if (image.src !== fallback) {
      image.src = fallback;
    } else {
      const missing = node('span', 'sprite-missing', '?');
      missing.setAttribute('role', 'img');
      missing.setAttribute('aria-label', 'Sprite nicht verfügbar');
      icon.replaceChildren(missing);
      icon.title = 'Sprite nicht verfügbar';
    }
  });
  image.src = dex <= 493 ? `${base}/versions/generation-iv/heartgold-soulsilver/${dex}.png`
    : dex <= 649 ? `${base}/versions/generation-v/black-white/${dex}.png` : fallback;
  icon.append(image);
  return icon;
}

function render() {
  const tabs = $('#binder-tabs');
  tabs.replaceChildren();
  binders.forEach((binder, index) => {
    const cards = countCards(binder);
    const tab = button('', `binder-tab ${binder.id === selected ? 'active' : ''}`, () => {
      selected = binder.id;
      page = 1;
      render();
    });
    tab.style.setProperty('--region', colors[index % colors.length]);
    tab.dataset.binderId = binder.id;
    tab.setAttribute('aria-pressed', String(binder.id === selected));
    tab.setAttribute('aria-label', `${binder.name}-Binder, ${cards} ${cards === 1 ? 'Karte' : 'Karten'}`);
    tab.append(node('span', 'tab-number', `REGION / ${String(binder.id).padStart(2, '0')}`),
      node('strong', '', binder.name), node('span', 'tab-meta', `KARTEN / ${String(cards).padStart(3, '0')}`));
    tabs.append(tab);
  });
  const binder = binders.find((item) => item.id === selected);
  if (!binder) return;
  const occupied = binder.entries.reduce((sum, entry) => sum + entry.slots.length, 0);
  const cardCount = countCards(binder);
  $('#binder-label').textContent = `REGION 0${binder.id} / ${binder.name.toLocaleUpperCase('de')}`;
  $('#binder-heading').textContent = `${binder.name}-Binder`;
  $('#binder-summary').textContent = `${cardCount} ${cardCount === 1 ? 'Karte' : 'Karten'} · ${binder.entries.length} Pokémon & Platzhalter`;
  const cap = $('#capacity');
  cap.replaceChildren();
  const capText = node('div', 'capacity-text');
  capText.append(node('span', '', 'BINDERKAPAZITÄT'), node('strong', '', `${occupied} / ${capacity} Fächer`));
  const track = node('div', 'track');
  const bar = node('div', 'bar');
  bar.style.width = `${Math.min(100, occupied / capacity * 100)}%`;
  track.append(bar);
  cap.append(capText, track, node('p', 'capacity-note', occupied > capacity
    ? 'Die bestehende Sammlung überschreitet die Kapazität. Weitere Fächer können nicht belegt werden.'
    : `${capacity - occupied} Fächer frei · Reservierungen und Platzhalter zählen mit`));
  const query = $('#search').value.trim();
  const needle = normalize(query.replace(/^#(?=\d)/, ''));
  const allEntries = query
    ? binders.flatMap((item) => item.entries.filter((entry) => entry.kind === 'home')
      .map((entry) => ({ binder: item, entry })))
    : binder.entries.map((entry) => ({ binder, entry }));
  const filtered = query ? allEntries.filter(({ entry }) => /^\d+$/.test(needle)
    ? entry.dex === Number(needle)
    : normalize(entry.name).includes(needle)) : allEntries;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages);
  $('#results-label').textContent = query ? 'SUCHERGEBNISSE · ALLE BINDER' : 'BINDERÜBERSICHT';
  $('#result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'Eintrag' : 'Einträge'}`;
  const results = $('#results');
  results.replaceChildren();
  if (!filtered.length) results.append(node('p', 'empty', 'Keine Pokémon gefunden. Versuche einen anderen Suchbegriff.'));
  for (const { binder: entryBinder, entry } of filtered.slice((page - 1) * pageSize, page * pageSize)) {
    const target = home(entry.dex);
    const row = button('', 'result', () => showDetail(entry.dex));
    const icon = pokemonSprite(entry.dex, entry.kind === 'placeholder', !owned(entry.dex));
    const info = node('span', 'result-info');
    info.append(node('strong', '', entry.name), node('small', '', `#${String(entry.dex).padStart(3, '0')}${entry.kind === 'placeholder' ? ' · Platzhalter' : ''}`));
    const loc = node('span', 'result-location');
    const place = node('strong', 'slot-place');
    if (query) place.append(node('span', 'slot-binder', entryBinder.name.toUpperCase()));
    place.append(node('span', 'slot-position', `${entry.slots[0].page} / ${entry.slots[0].slot}`));
    loc.append(place);
    const count = entry.slots.filter((slot) => slot.card).length;
    const holoCount = entry.slots.filter((slot) => slot.card?.holo).length;
    const small = node('small', '', entry.kind === 'placeholder' ? '' : `${count} ${count === 1 ? 'Karte' : 'Karten'}${holoCount ? ` · ✦${holoCount}` : ''}`);
    if (entry.kind === 'placeholder') {
      const homeSlot = target.entry.slots[0];
      small.append(node('span', '', target.binder.name.toUpperCase()), node('span', '', `${homeSlot.page} / ${homeSlot.slot}`));
      icon.append(node('span', 'binder-initial', target.binder.name[0].toUpperCase()));
    }
    loc.append(small);
    row.append(icon, info, loc, node('span', 'row-arrow', '›'));
    results.append(row);
  }
  $('#pagination').hidden = pages <= 1;
  $('#page-label').textContent = `${page} / ${pages}`;
  $('#previous').disabled = page === 1;
  $('#next').disabled = page === pages;
}

function field(label, name, placeholder) {
  const wrapper = node('label', 'field', label);
  const input = node('input');
  input.name = name;
  input.placeholder = placeholder;
  input.required = true;
  input.maxLength = 200;
  wrapper.append(input);
  return wrapper;
}

function languageField(value) {
  const wrapper = node('label', 'field', 'Kartensprache');
  const select = node('select');
  select.name = 'language';
  for (const [code, label] of [['de', 'Deutsch'], ['en', 'Englisch'], ['ja', 'Japanisch'], ['ko', 'Koreanisch'], ['zh-tw', 'Chinesisch (traditionell)'], ['zh-cn', 'Chinesisch (vereinfacht)']]) {
    const option = node('option', '', label);
    option.value = code;
    select.append(option);
  }
  if (value) select.value = value;
  wrapper.append(select);
  return wrapper;
}

function cardImage(url, label, onError) {
  const container = node('div', 'card-image');
  if (!url) {
    container.append(node('span', 'image-missing', 'Kein Bild verfügbar'));
    return container;
  }
  const image = node('img');
  image.src = url;
  image.alt = `Kartenbild: ${label}`;
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    container.replaceChildren(node('span', 'image-missing', 'Bild konnte nicht geladen werden'));
    if (onError) onError();
  });
  container.append(image);
  return container;
}

function addGermanFallback(container, provider, language, id) {
  const note = node('span', 'fallback-note', 'Deutsches Ersatzbild wird gesucht …');
  container.append(note);
  const params = new URLSearchParams({ provider, language, id });
  request(`/api/german-image?${params}`).then(({ image }) => {
    if (!image) {
      note.textContent = 'Kein deutsches Ersatzbild gefunden.';
      return;
    }
    const description = node('span', 'fallback-note', `Deutsches Ersatzbild: ${image.label} · Motiv oder Variante kann abweichen.`);
    const picture = cardImage(image.url, image.label, () => {
      description.textContent = `Deutsches Ersatzbild gefunden (${image.label}), aber das Bild konnte nicht geladen werden.`;
    });
    container.replaceChildren(picture, description);
  }).catch((error) => { note.textContent = `Ersatzbildsuche fehlgeschlagen: ${error.message}`; });
}

function confirmCard(found, target, targetDex, linking, warnings) {
  const dialog = $('#card-confirm');
  $('#confirm-title').textContent = linking ? 'Karte verknüpfen' : 'Karte hinzufügen';
  $('#confirm-intro').textContent = linking
    ? 'Diese Katalogkarte mit deiner vorhandenen Karte verknüpfen?'
    : 'Diese Karte deiner Sammlung hinzufügen?';
  $('#confirm-card-name').textContent = found.name;
  $('#confirm-card-set').textContent = `${found.set} · ${found.number}`;
  $('#confirm-pokemon').textContent = `${target.entry.name} · #${String(targetDex).padStart(3, '0')}`;
  $('#confirm-binder').textContent = `${target.binder.name}-Binder`;
  const warningContainer = $('#confirm-warnings');
  warningContainer.replaceChildren(...warnings.filter(Boolean).map((warning) => node('p', '', warning)));
  warningContainer.hidden = !warningContainer.childElementCount;
  $('#confirm-accept').textContent = linking ? 'Verknüpfen' : 'Karte hinzufügen';
  $('#confirm-holo-label').hidden = linking;
  $('#confirm-holo').checked = false;
  dialog.returnValue = '';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'accept' && { holo: $('#confirm-holo').checked }), { once: true });
    dialog.showModal();
  });
}

function imageSearch(card, dex, container) {
  container.replaceChildren();
  const heading = node('p', 'image-search-title', 'Karte im Katalog suchen');
  const note = node('p', 'form-note', 'Gib Setname oder Setkürzel und die aufgedruckte Kartennummer ein.');
  const form = node('form', 'image-search-form');
  const setField = field('Setname oder Setkürzel', 'set', 'z. B. Grundset');
  setField.querySelector('input').value = card?.set ?? '';
  const numberField = field('Kartennummer', 'number', 'z. B. 55/102');
  numberField.querySelector('input').value = card?.number ?? '';
  const langField = languageField(card?.cardLanguage || card?.tcgdex?.language || card?.ptcg?.language);
  const submit = node('button', 'secondary', 'Karten suchen');
  submit.type = 'submit';
  const results = node('div', 'image-results');
  results.setAttribute('aria-live', 'polite');
  form.append(setField, numberField, langField, submit);
  let searchValues;
  let searchSequence = 0;
  async function runSearch(searchPage) {
    const values = searchValues;
    const sequence = ++searchSequence;
    const params = new URLSearchParams({ set: values.set, number: values.number,
      language: values.language, page: String(searchPage) });
    submit.disabled = true;
    results.replaceChildren(node('p', 'muted', 'Katalog wird durchsucht …'));
    try {
      const result = await request(`/api/card-search?${params}`);
      if (sequence !== searchSequence) return;
      results.replaceChildren();
      results.append(node('p', 'form-note', `Passende Sets in den Katalogen: ${result.totalSets} · Setgruppe ${result.page}. Der Teil nach / wird nur geprüft, wenn die Quelle die vollständige Nummer enthält.`));
      for (const warning of result.warnings) results.append(node('p', 'search-warning', `Katalog nicht verfügbar: ${warning}`));
      if (!result.cards.length) results.append(node('p', 'muted', 'In dieser Setgruppe kein Treffer. Weitere Setgruppen prüfen oder Kartensprache und Nummer ändern.'));
      for (const candidate of result.cards) {
        const row = node('div', 'candidate');
        const picture = node('div', 'candidate-picture');
        picture.append(cardImage(candidate.image, candidate.name,
          () => addGermanFallback(picture, candidate.provider, candidate.language, candidate.id)));
        if (!candidate.image) addGermanFallback(picture, candidate.provider, candidate.language, candidate.id);
        row.append(picture);
        const info = node('div', 'candidate-info');
        info.append(node('strong', '', candidate.name), node('small', '', `${candidate.set} · ${candidate.number} · ${candidate.id}`));
        if (candidate.comparison) info.append(node('small', 'search-warning', 'Japanische Vergleichskarte, keine bestätigte koreanische Ausgabe. Bitte selbst vergleichen.'));
        if (!candidate.suffixVerified && values.number.includes('/')) info.append(node('small', 'search-warning', 'Teil nach / nicht verifiziert.'));
        const choose = button('Auswählen', 'secondary', async () => {
          choose.disabled = true;
          try {
            const params = new URLSearchParams({ id: candidate.id, language: candidate.language, provider: candidate.provider });
            const general = dex === null;
            if (general) params.set('resolvePokemon', '1');
            const { card: found, resolution } = await request(`/api/catalog-card?${params}`);
            const unverified = values.number.includes('/') && !candidate.suffixVerified
              ? 'Der Teil nach / wurde nicht überprüft.' : '';
            const comparison = candidate.comparison ? 'Dies ist nur eine japanische Vergleichskarte, keine verifizierte koreanische Ausgabe. Die tatsächliche Kartensprache wird als Koreanisch gespeichert.' : '';
            const save = async (targetDex) => {
              const target = home(targetDex);
              if (!target) throw new Error(`Pokémon #${targetDex} ist in den vorhandenen Bindern nicht enthalten.`);
              const mismatch = !general && found.dexIds.length
                ? (found.dexIds.includes(targetDex) ? '' : `Achtung: Die Quelle nennt Dex-Nr. ${found.dexIds.join(', ')}, nicht #${targetDex}.`)
                : (!general ? 'Für diese Karte meldet die Quelle keine überprüfte Dex-Nummer. Bitte prüfe die Zuordnung selbst.' : '');
              const confirmed = await confirmCard(found, target, targetDex, Boolean(card), [mismatch, unverified, comparison]);
              if (!confirmed) {
                choose.disabled = false;
                return;
              }
              let added;
              if (card) {
                await request(`/api/cards/${encodeURIComponent(card.id)}`, {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: found.id, language: found.language, provider: candidate.provider, cardLanguage: values.language }),
                });
              } else {
                ({ card: added } = await request('/api/cards', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ dex: targetDex, number: values.number, cardLanguage: values.language, holo: confirmed.holo,
                    ...(candidate.comparison ? { set: values.set } : {}),
                    catalog: { id: found.id, language: found.language, provider: candidate.provider } }),
                }));
              }
              await refresh();
              if (general) {
                const updated = home(targetDex);
                const slot = updated.entry.slots.find((item) => item.card?.id === added.id);
                searchSequence++;
                submit.disabled = false;
                results.replaceChildren();
                numberField.querySelector('input').value = '';
                numberField.querySelector('input').focus();
                notify(`Karte hinzugefügt: ${updated.entry.name} · ${updated.binder.name} · ${formatSlot(slot)}.`);
              } else {
                if (!card) {
                  searchSequence++;
                  submit.disabled = false;
                  results.replaceChildren();
                  numberField.querySelector('input').value = '';
                }
                if (currentDetail === targetDex) {
                  showDetail(targetDex, card ? undefined : container);
                  if (!card) numberField.querySelector('input').focus();
                }
                notify(card ? 'Kartenbild-Verknüpfung gespeichert.' : 'Karte hinzugefügt und Bild verknüpft.');
              }
            };
            if (!general) {
              await save(dex);
            } else if (resolution.dexIds.length === 1) {
              await save(resolution.dexIds[0]);
            } else {
              const options = binders.flatMap((binder) => binder.entries
                .filter((entry) => entry.kind === 'home' && (!resolution.dexIds.length || resolution.dexIds.includes(entry.dex)))
                .map((entry) => ({ dex: entry.dex, name: entry.name, binder: binder.name })))
                .sort((a, b) => a.dex - b.dex);
              if (!options.length) throw new Error('Keines der erkannten Pokémon ist in den vorhandenen Bindern enthalten.');
              const picker = node('div', 'pokemon-picker');
              const label = node('label', 'field', resolution.dexIds.length
                ? 'Mehrere Pokémon erkannt – bitte auswählen' : 'Pokémon nicht eindeutig erkannt – bitte selbst auswählen');
              const select = node('select');
              const placeholder = node('option', '', 'Pokémon auswählen …');
              placeholder.value = '';
              select.append(placeholder);
              for (const option of options) {
                const element = node('option', '', `#${option.dex} ${option.name} · ${option.binder}`);
                element.value = String(option.dex);
                select.append(element);
              }
              label.append(select);
              const add = button('Karte hinzufügen', 'secondary', async () => {
                if (!select.value) {
                  picker.querySelector('.search-warning').textContent = 'Bitte ein Pokémon auswählen.';
                  return;
                }
                add.disabled = true;
                try { await save(Number(select.value)); }
                catch (error) { picker.querySelector('.search-warning').textContent = error.message; }
                finally { add.disabled = false; }
              });
              picker.append(label, node('p', 'search-warning', resolution.error || ''), add);
              choose.replaceWith(picker);
            }
          } catch (error) {
            results.prepend(node('p', 'search-warning', error.message));
            choose.disabled = false;
          }
        });
        info.append(choose);
        row.append(info);
        results.append(row);
      }
      if (result.page > 1 || result.hasMore) {
        const navigation = node('div', 'search-pages');
        if (result.page > 1) navigation.append(button('← Vorherige Sets', 'secondary', () => runSearch(result.page - 1)));
        if (result.hasMore) navigation.append(button('Weitere Sets →', 'secondary', () => runSearch(result.page + 1)));
        results.append(navigation);
      }
    } catch (error) {
      if (sequence === searchSequence) results.replaceChildren(node('p', 'search-warning', `Kartensuche fehlgeschlagen: ${error.message}`));
    } finally { if (sequence === searchSequence) submit.disabled = false; }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const set = values.get('set').trim();
    if (!set) {
      results.replaceChildren(node('p', 'search-warning', 'Bitte einen Setnamen oder ein Setkürzel eingeben.'));
      return;
    }
    searchValues = { set, number: values.get('number'), language: values.get('language') };
    runSearch(1);
  });
  container.append(heading, note, form, results);
}

const pokedexCache = new Map();
let activeCry = null;
let currentDetail = null;
let collectionScroll = 0;
let collectionFocus = null;
const statLabels = {
  hp: ['KP', 'Kraftpunkte'], attack: ['ANG', 'Angriff'], defense: ['VERT', 'Verteidigung'],
  'special-attack': ['SP-A', 'Spezial-Angriff'], 'special-defense': ['SP-V', 'Spezial-Verteidigung'],
  speed: ['INIT', 'Initiative'],
};

function stopCry() {
  if (!activeCry) return;
  const audio = activeCry;
  activeCry = null;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

function cryControl(url, name) {
  if (!url) return null;
  const play = button('', 'cry-button', () => {
    stopCry();
    const audio = document.createElement('audio');
    activeCry = audio;
    audio.preload = 'none';
    audio.src = url;
    const showError = () => {
      if (activeCry === audio) notify('Ruf konnte nicht abgespielt werden. Bitte erneut versuchen.', true);
    };
    audio.addEventListener('error', showError);
    audio.play().catch(showError);
  });
  play.innerHTML = '<svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true"><g transform="translate(-1 0)" fill="#23362f"><path d="M8 13h4l5-4v16l-5-4H8z"/><path d="M20.5 12.5a6 6 0 0 1 0 9M23.5 9.5a10 10 0 0 1 0 15" fill="none" stroke="#23362f" stroke-width="2" stroke-linecap="round"/></g></svg>';
  play.setAttribute('aria-label', `Ruf von ${name} abspielen`);
  return play;
}

function pokemonArtwork(dex, name, className, hidden) {
  const picture = node('div', hidden ? `${className} silhouette` : className);
  const image = node('img');
  image.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png`;
  image.alt = hidden ? 'Unbekanntes Pokémon' : `Illustration von ${name}`;
  image.loading = 'lazy';
  image.addEventListener('error', () => picture.replaceChildren(node('span', 'pokedex-image-error', 'Bild nicht verfügbar')));
  picture.append(image);
  return picture;
}

function typeBadges(types, includeMultiplier = false) {
  const group = node('div', 'pokedex-badges');
  for (const type of types) {
    const text = includeMultiplier && type.multiplier !== 2 ? `${type.name} ×${type.multiplier}` : type.name;
    group.append(node('span', `type-badge type-${type.id}`, text));
  }
  if (!types.length) group.append(node('span', 'pokedex-muted', 'Keine'));
  return group;
}

function renderPokedex(container, data, currentDex) {
  if (data.types.length < 1 || data.types.length > 2) throw new Error('Ungültige Pokémon-Typen.');
  const styles = getComputedStyle(document.documentElement);
  const colors = data.types.map((type) => {
    const color = styles.getPropertyValue(`--type-${type.id}`).trim();
    if (!color) throw new Error(`Keine Farbe für Pokémon-Typ ${type.name}.`);
    return color;
  });
  const layout = node('div', 'pokedex-layout');
  const name = home(currentDex).entry.name;
  const known = owned(currentDex);
  const unknown = '???';
  const artwork = pokemonArtwork(currentDex, name, 'pokedex-art', !known);
  const cry = known ? cryControl(data.cry, name) : null;
  if (cry) artwork.append(cry);
  const stats = node('section', 'pokedex-stats');
  stats.append(node('h4', '', 'Artenspezifische Stärken'));
  const chart = node('div', 'stats-chart');
  for (const [id, [label, fullLabel]] of Object.entries(statLabels)) {
    const stat = data.stats.find((item) => item.id === id);
    const column = node('div', 'stat-column');
    column.setAttribute('aria-label', `${fullLabel}: ${!known ? 'unbekannt' : stat ? stat.value : 'nicht verfügbar'}`);
    const track = node('div', 'stat-track');
    if (known && stat) {
      const bar = node('div', 'stat-bar');
      bar.style.height = `${Math.min(100, stat.value / 255 * 100)}%`;
      track.append(bar);
    }
    const abbreviation = node('span', '', label);
    abbreviation.title = fullLabel;
    column.append(node('strong', '', !known ? unknown : stat ? String(stat.value) : '–'), track, abbreviation);
    chart.append(column);
  }
  stats.append(chart, node('small', 'pokedex-muted', 'Basiswerte · Skala bis 255'));

  const right = node('div', 'pokedex-info');
  const description = node('div', 'pokedex-entry');
  description.append(node('span', 'pokedex-entry-label', 'Pokédex-Eintrag'),
    node('p', 'pokedex-description', !known ? unknown : data.description || 'Kein deutscher Pokédex-Text verfügbar.'));
  right.append(description);
  const facts = node('div', 'pokedex-facts');
  const fact = (label, value) => {
    const field = node('div');
    field.append(node('span', '', label), node('strong', '', value));
    facts.append(field);
  };
  const decimal = (number) => (number / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  fact('Größe', known ? `${decimal(data.height)} m` : unknown);
  fact('Kategorie', known ? data.category || 'Nicht verfügbar' : unknown);
  fact('Gewicht', known ? `${decimal(data.weight)} kg` : unknown);
  fact('Fähigkeiten', !known ? unknown : data.abilities.length
    ? data.abilities.map((ability) => `${ability.name}${ability.hidden ? ' (versteckt)' : ''}`).join(', ')
    : 'Nicht verfügbar');
  const hiddenBadges = () => {
    const group = node('div', 'pokedex-badges');
    group.append(node('span', 'type-badge', unknown));
    return group;
  };
  right.append(facts, node('h4', 'pokedex-subheading', 'Typ'), known ? typeBadges(data.types) : hiddenBadges(),
    node('h4', 'pokedex-subheading', 'Schwächen'), known ? typeBadges(data.weaknesses, true) : hiddenBadges());
  layout.append(artwork, right, stats);

  const evolution = node('section', 'pokedex-evolution');
  evolution.append(node('h4', '', 'Entwicklungen'));
  const list = node('div', 'evolution-tree');
  function branch(item) {
    const wrapper = node('div', 'evolution-branch');
    const target = home(item.id);
    const itemKnown = owned(item.id);
    const body = target ? button('', 'evolution-card', () => showDetail(item.id))
      : node('div', 'evolution-card');
    if (item.id === currentDex) body.classList.add('current');
    if (target) body.setAttribute('aria-label', itemKnown ? `${item.name}, National-Dex ${item.id}, Details öffnen` : 'Unbekanntes Pokémon, Details öffnen');
    body.append(pokemonArtwork(item.id, item.name, 'evolution-art', !itemKnown),
      node('strong', '', itemKnown ? item.name : unknown),
      node('small', '', itemKnown ? `Nr. ${String(item.id).padStart(4, '0')}` : 'Nr. ???'),
      itemKnown ? typeBadges(item.types) : hiddenBadges());
    wrapper.append(body);
    const children = data.evolutions.filter((entry) => entry.parent === item.id);
    if (children.length) {
      const branches = node('div', 'evolution-children');
      for (const child of children) branches.append(branch(child));
      wrapper.append(branches);
    }
    return wrapper;
  }
  for (const root of data.evolutions.filter((item) => item.parent === null)) list.append(branch(root));
  evolution.append(list);
  const background = colors.length === 1
    ? `linear-gradient(${colors[0]}, ${colors[0]})`
    : `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)`;
  const detail = container.closest('.detail-page');
  if (known) {
    detail.style.setProperty('--pokemon-background', background);
    detail.classList.add('has-type-colors');
    const lightTypes = ['normal', 'psychic', 'flying', 'electric', 'dragon', 'ice'];
    detail.classList.toggle('has-light-type', data.types.some((type) => lightTypes.includes(type.id)));
    detail.classList.toggle('has-light-only', data.types.every((type) => lightTypes.includes(type.id)));
  }
  container.replaceChildren(layout, evolution, node('p', 'pokedex-source', 'Daten: PokéAPI · Standardform'));
}

async function loadPokedex(container, dex) {
  container.replaceChildren(node('p', 'pokedex-muted', 'Pokédex-Daten werden geladen …'));
  try {
    let data = pokedexCache.get(dex);
    if (!data) {
      ({ pokemon: data } = await request(`/api/pokedex/${dex}`));
      pokedexCache.set(dex, data);
    }
    if (container.isConnected) renderPokedex(container, data, dex);
  } catch (error) {
    if (!container.isConnected) return;
    container.replaceChildren(node('p', 'search-warning', `Pokédex konnte nicht geladen werden: ${error.message}`),
      button('Erneut versuchen', 'secondary', () => loadPokedex(container, dex)));
  }
}

function showDetail(dex, openSearch, fromHistory = false) {
  const target = home(dex);
  if (!target) return;
  const navigating = currentDetail !== dex;
  if (currentDetail === null) {
    collectionScroll = window.scrollY;
    collectionFocus = document.activeElement;
  }
  if (navigating && !fromHistory) {
    const state = { ...history.state, pokemonDex: dex };
    if (currentDetail === null) history.pushState(state, '');
    else history.replaceState(state, '');
  }
  currentDetail = dex;
  stopCry();
  $('#collection-view').hidden = true;
  $('#detail').hidden = false;
  $('#detail').classList.remove('has-type-colors', 'has-light-type', 'has-light-only');
  $('#detail').style.removeProperty('--pokemon-background');
  const { binder, entry } = target;
  const content = $('#detail-content');
  content.replaceChildren();
  const title = node('h1', 'detail-title', entry.name);
  title.tabIndex = -1;
  const heading = node('div', 'detail-heading');
  const dexNumber = node('span', 'detail-dex');
  dexNumber.append(node('span', 'detail-dex-label', `#${String(dex).padStart(3, '0')}`));
  dexNumber.setAttribute('aria-label', `National-Dex Nummer ${dex}`);
  heading.append(title, dexNumber);
  content.append(heading, node('p', 'detail-location', `⌖  ${binder.name.toUpperCase()} · ${formatSlot(entry.slots[0])}`));
  const references = binders.flatMap((b) => b.entries.filter((e) => e.dex === dex && e.kind === 'placeholder')
    .map((e) => `${b.name.toUpperCase()}: ${formatSlot(e.slots[0])}`));
  if (references.length) content.append(node('p', 'reference', `Platzhalter: ${references.join(' · ')}`));
  const pokedex = node('section', 'pokedex');
  pokedex.setAttribute('aria-label', `Pokédex-Eintrag ${entry.name}`);
  pokedex.setAttribute('aria-live', 'polite');
  content.append(pokedex);
  loadPokedex(pokedex, dex);
  content.append(node('h3', 'detail-subtitle', `Meine Karten (${entry.slots.filter((slot) => slot.card).length})`));
  const cards = node('div', 'card-list');
  for (const slot of entry.slots.filter((item) => item.card)) {
    const wrapper = node('div', 'owned-card');
    const row = node('div', 'card-row');
    const catalog = slot.card.tcgdex || slot.card.ptcg;
    if (catalog) {
      const picture = node('div', 'candidate-picture');
      picture.append(cardImage(catalog.image, catalog.name,
        () => addGermanFallback(picture, slot.card.ptcg ? 'ptcg' : 'tcgdex', catalog.language, catalog.id)));
      if (!catalog.image) addGermanFallback(picture, slot.card.ptcg ? 'ptcg' : 'tcgdex', catalog.language, catalog.id);
      row.append(picture);
    }
    const info = node('div');
    info.append(node('strong', '', `${slot.card.set} · ${slot.card.number}`), node('small', '', formatSlot(slot)));
    if (slot.card.holo) info.append(node('small', 'holo-badge', '✦ Glänzend'));
    if (catalog) info.append(node('small', '', `${slot.card.ptcg ? 'PTCG-card-data' : 'TCGdex'}: ${catalog.name} (${catalog.language.toUpperCase()})`));
    if (slot.card.cardLanguage) info.append(node('small', 'form-note',
      `Kartensprache: ${slot.card.cardLanguage.toUpperCase()}${catalog && catalog.language !== slot.card.cardLanguage ? ' · Vergleichskarte' : ''}`));
    const actions = node('div', 'card-actions');
    const searchContainer = node('div', 'image-search');
    const find = button(catalog ? 'Katalog ändern' : 'Bild suchen', 'image-link', () => {
      if (searchContainer.childElementCount) {
        searchContainer.replaceChildren();
        return;
      }
      imageSearch(slot.card, dex, searchContainer);
    });
    actions.append(find, button('Entfernen', 'remove', async () => {
      if (!confirm(`Karte ${slot.card.set} ${slot.card.number} entfernen?`)) return;
      try {
        await request(`/api/cards/${encodeURIComponent(slot.card.id)}`, { method: 'DELETE' });
        await refresh();
        if (currentDetail === dex) showDetail(dex);
        notify('Karte entfernt. Die Binderplätze wurden neu berechnet.');
      } catch (error) { notify(error.message, true); }
    }));
    row.append(info, actions);
    wrapper.append(row, searchContainer);
    cards.append(wrapper);
  }
  if (!cards.childElementCount) cards.append(node('p', 'muted', 'Noch keine Karte erfasst. Ein Fach ist reserviert.'));
  content.append(cards);
  const catalogSearch = openSearch || node('div', 'image-search');
  content.append(button('Karte hinzufügen', 'secondary catalog-button', () => {
    if (catalogSearch.childElementCount) catalogSearch.replaceChildren();
    else imageSearch(null, dex, catalogSearch);
  }), catalogSearch);
  if (navigating) {
    window.scrollTo(0, 0);
    title.focus({ preventScroll: true });
  }
}

function showCollection() {
  if (currentDetail === null) return;
  if ($('#card-confirm').open) $('#card-confirm').close('cancel');
  stopCry();
  currentDetail = null;
  $('#detail').hidden = true;
  $('#detail-content').replaceChildren();
  $('#collection-view').hidden = false;
  window.scrollTo(0, collectionScroll);
  if (collectionFocus?.isConnected) collectionFocus.focus({ preventScroll: true });
  else $('#search').focus({ preventScroll: true });
}

$('#search').addEventListener('input', () => { page = 1; render(); });
$('#previous').addEventListener('click', () => { page--; render(); });
$('#next').addEventListener('click', () => { page++; render(); });
$('#home').addEventListener('click', () => {
  if (currentDetail === null) return;
  if (history.state?.pokemonDex) history.back();
  else showCollection();
});
window.addEventListener('popstate', (event) => {
  if (event.state?.pokemonDex && home(event.state.pokemonDex)) showDetail(event.state.pokemonDex, undefined, true);
  else showCollection();
});
$('#add-general').addEventListener('click', () => {
  imageSearch(null, null, $('#general-search'));
  $('#general-add').showModal();
});
$('#close-general').addEventListener('click', () => $('#general-add').close());
$('#confirm-close').addEventListener('click', () => $('#card-confirm').close('cancel'));
$('#card-confirm').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    $('#card-confirm').close('cancel');
  }
});
refresh().then(() => {
  const linked = Number(new URLSearchParams(location.search).get('pokemon'));
  if (Number.isInteger(linked) && home(linked)) {
    history.replaceState(null, '', location.pathname);
    showDetail(linked, undefined, true);
  } else if (history.state?.pokemonDex && home(history.state.pokemonDex)) {
    showDetail(history.state.pokemonDex, undefined, true);
  }
}).catch((error) => {
  $('#results').replaceChildren(node('p', 'empty', `Daten konnten nicht geladen werden: ${error.message}`));
  notify(error.message, true);
});
