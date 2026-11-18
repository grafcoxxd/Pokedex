import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { addCard, BINDER_CAPACITY, linkCard, loadDatabase, positions, removeCard, saveDatabase } from './binder.js';
import { getCard } from './tcgdex.js';
import { getChineseCard } from './ptcg.js';
import { searchCatalog } from './catalog-search.js';
import { findGermanImage } from './fallback.js';
import { resolvePokemon } from './pokemon-resolution.js';
import { getPokedex } from './pokedex.js';

const assets = new Map([
  ['/', ['../public/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['../public/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['../public/style.css', 'text/css; charset=utf-8']],
  ['/fonts/PressStart2P-Regular.ttf', ['../public/fonts/PressStart2P-Regular.ttf', 'font/ttf']],
  ['/region-maps/kanto.png', ['../public/region-maps/kanto.png', 'image/png']],
  ['/region-maps/johto.png', ['../public/region-maps/johto.png', 'image/png']],
  ['/region-maps/hoenn.png', ['../public/region-maps/hoenn.png', 'image/png']],
  ['/region-maps/sinnoh.png', ['../public/region-maps/sinnoh.png', 'image/png']],
]);
const databasePath = process.env.BINDER_DB || 'collection.json';
const seedPath = fileURLToPath(new URL('../data/seed.json', import.meta.url));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Ungültiger PORT.');

async function catalogCard(id, language, provider) {
  if (!provider || provider === 'tcgdex') return getCard(id, language);
  if (provider === 'ptcg' && language === 'zh-cn') return getChineseCard(id);
  throw new Error('Ungültige Katalogquelle oder Kartensprache.');
}

async function initialize() {
  try {
    await loadDatabase(databasePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await saveDatabase(databasePath, await loadDatabase(seedPath), { create: true });
  }
}

function respond(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16384) {
      const error = new Error('Anfrage ist zu groß.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error('Ungültige JSON-Anfrage.');
    error.status = 400;
    throw error;
  }
}

let mutations = Promise.resolve();
function mutate(action) {
  const result = mutations.then(async () => {
    const data = await loadDatabase(databasePath);
    const result = action(data);
    await saveDatabase(databasePath, data);
    return result;
  });
  mutations = result.catch(() => {});
  return result;
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
}

const extraHosts = [process.env.RENDER_EXTERNAL_HOSTNAME, ...(process.env.ALLOWED_HOSTS || '').split(',')]
  .map((h) => h?.trim().toLowerCase())
  .filter(Boolean);

function isAllowedHost(host) {
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return true;
  return extraHosts.includes(host.toLowerCase().replace(/:\d+$/, ''));
}

const server = createServer(async (req, res) => {
  try {
    if (!isAllowedHost(req.headers.host || '')) {
      respond(res, 403, { error: 'Ungültiger Host.' });
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const asset = assets.get(url.pathname);
    if (req.method === 'GET' && asset) {
      const contents = await readFile(fileURLToPath(new URL(asset[0], import.meta.url)));
      res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
      res.end(contents);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/binders') {
      await mutations;
      const data = await loadDatabase(databasePath);
      respond(res, 200, { binders: positions(data), capacity: BINDER_CAPACITY });
      return;
    }
    const pokedexMatch = url.pathname.match(/^\/api\/pokedex\/(\d+)$/);
    if (req.method === 'GET' && pokedexMatch) {
      try {
        const dex = Number(pokedexMatch[1]);
        const data = await loadDatabase(databasePath);
        if (!data.binders.some((binder) => binder.entries.some((entry) => entry.kind === 'home' && entry.dex === dex))) {
          respond(res, 404, { error: 'Pokémon ist nicht in den vorhandenen Bindern enthalten.' });
          return;
        }
        respond(res, 200, { pokemon: await getPokedex(dex) });
      } catch (error) {
        respond(res, 502, { error: error.message });
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/card-search') {
      try {
        const lang = url.searchParams.get('language');
        const set = url.searchParams.get('set') || '';
        const number = url.searchParams.get('number');
        const page = Number(url.searchParams.get('page') || '1');
        const result = await searchCatalog(set, number, lang, page);
        respond(res, 200, result);
      } catch (error) {
        respond(res, 400, { error: error.message });
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/german-image') {
      try {
        const provider = url.searchParams.get('provider');
        const language = url.searchParams.get('language');
        const id = url.searchParams.get('id');
        const result = await findGermanImage(provider, language, id);
        respond(res, 200, { image: result });
      } catch (error) {
        respond(res, 400, { error: error.message });
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/catalog-card') {
      try {
        const card = await catalogCard(url.searchParams.get('id'), url.searchParams.get('language'), url.searchParams.get('provider'));
        if (url.searchParams.get('resolvePokemon') === '1') {
          try {
            const resolution = await resolvePokemon(card);
            respond(res, 200, { card, resolution });
          } catch (error) {
            respond(res, 200, { card, resolution: { dexIds: [], source: null, error: error.message } });
          }
        } else {
          respond(res, 200, { card });
        }
      } catch (error) {
        respond(res, 400, { error: error.message });
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/cards') {
      if (!isSameOrigin(req)) {
        respond(res, 403, { error: 'Fremde Herkunft ist nicht erlaubt.' });
        return;
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        respond(res, 415, { error: 'JSON erforderlich.' });
        return;
      }
      const input = await body(req);
      if (!input || typeof input !== 'object') {
        respond(res, 400, { error: 'Ungültige Kartendaten.' });
        return;
      }
      if (input.catalog) {
        let found;
        try {
          found = await catalogCard(input.catalog.id, input.catalog.language, input.catalog.provider);
        } catch (error) {
          respond(res, 400, { error: error.message });
          return;
        }
        try {
          const card = await mutate((data) => {
            const added = addCard(data, input.dex, input.set === undefined ? found.set : input.set, input.number);
            return linkCard(data, added.id, found, input.cardLanguage);
          });
          respond(res, 201, { card });
        } catch (error) {
          if (error.code) throw error;
          respond(res, 400, { error: error.message });
        }
        return;
      }
      try {
        const card = await mutate((data) => addCard(data, input.dex, input.set, input.number, input.cardLanguage));
        respond(res, 201, { card });
      } catch (error) {
        if (error.code) throw error;
        respond(res, 400, { error: error.message });
      }
      return;
    }
    const cardMatch = url.pathname.match(/^\/api\/cards\/([a-f0-9-]+)$/i);
    if (req.method === 'PUT' && cardMatch) {
      if (!isSameOrigin(req)) {
        respond(res, 403, { error: 'Fremde Herkunft ist nicht erlaubt.' });
        return;
      }
      if (!req.headers['content-type']?.startsWith('application/json')) {
        respond(res, 415, { error: 'JSON erforderlich.' });
        return;
      }
      const input = await body(req);
      if (!input || typeof input !== 'object') {
        respond(res, 400, { error: 'Ungültige Kartendaten.' });
        return;
      }
      let found;
      try {
        found = await catalogCard(input.id, input.language, input.provider);
      } catch (error) {
        respond(res, 400, { error: error.message });
        return;
      }
      try {
        const card = await mutate((data) => linkCard(data, cardMatch[1], found, input.cardLanguage));
        respond(res, 200, { card });
      } catch (error) {
        if (error.code) throw error;
        respond(res, 400, { error: error.message });
      }
      return;
    }
    if (req.method === 'DELETE' && cardMatch) {
      if (!isSameOrigin(req)) {
        respond(res, 403, { error: 'Fremde Herkunft ist nicht erlaubt.' });
        return;
      }
      try {
        await mutate((data) => removeCard(data, cardMatch[1]));
        respond(res, 200, { ok: true });
      } catch (error) {
        if (error.code) throw error;
        respond(res, 400, { error: error.message });
      }
      return;
    }
    respond(res, 404, { error: 'Nicht gefunden.' });
  } catch (error) {
    if (error.status) {
      respond(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    if (!res.headersSent) respond(res, 500, { error: 'Serverfehler. Einzelheiten stehen im Terminal.' });
    else res.destroy();
  }
});

await initialize();
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => {
  console.log(`Pokémon-Binder läuft auf http://${host}:${server.address().port}`);
});
