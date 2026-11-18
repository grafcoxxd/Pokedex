import { fileURLToPath } from 'node:url';
import { addCard, loadDatabase, positions, removeCard, saveDatabase, search } from './binder.js';

const seedPath = fileURLToPath(new URL('../data/seed.json', import.meta.url));
const databasePath = process.env.BINDER_DB || 'collection.json';
const [command, ...args] = process.argv.slice(2);
const usage = `Befehle:
  node src/cli.js init
  node src/cli.js search <Name oder National-Dex-Nummer>
  node src/cli.js binder <Kanto|Johto|Hoenn|Sinnoh>
  node src/cli.js add-card <National-Dex-Nummer> <Set> <Kartennummer>
  node src/cli.js remove-card <Karten-ID>

Die Datenbank liegt standardmäßig in collection.json. BINDER_DB setzt einen anderen Pfad.`;

function requireArgs(count) {
  if (args.length !== count) throw new Error(`Falsche Anzahl an Argumenten.\n${usage}`);
}

function location(slot) {
  return `Seite ${slot.page}, Steckplatz ${slot.slot}`;
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    console.log(usage);
    return;
  }
  if (command === 'init') {
    requireArgs(0);
    const data = await loadDatabase(seedPath);
    await saveDatabase(databasePath, data, { create: true });
    console.log(`Datenbank erstellt: ${databasePath}`);
    return;
  }
  if (!['search', 'binder', 'add-card', 'remove-card'].includes(command)) {
    throw new Error(`Unbekannter Befehl: ${command}\n${usage}`);
  }
  const data = await loadDatabase(databasePath);
  if (command === 'search') {
    requireArgs(1);
    const matches = search(data, args[0]);
    if (!matches.length) {
      console.log('Kein Pokémon gefunden.');
      return;
    }
    for (const match of matches) {
      console.log(`#${match.dex} ${match.name}: ${match.homeBinder}, ${location(match.slots[0])}`);
      for (const [index, slot] of match.slots.entries()) {
        if (slot.card) console.log(`  Karte ${index + 1}: ${slot.card.set} ${slot.card.number}, ${location(slot)} (ID: ${slot.card.id})`);
      }
      for (const ref of match.placeholders) {
        console.log(`  Platzhalter: ${ref.binder}, ${location(ref)}`);
      }
    }
  } else if (command === 'binder') {
    requireArgs(1);
    const binder = positions(data).find((item) => item.name.toLocaleLowerCase('de') === args[0].toLocaleLowerCase('de'));
    if (!binder) throw new Error(`Binder "${args[0]}" nicht gefunden.`);
    for (const entry of binder.entries) {
      const suffix = entry.kind === 'placeholder' ? ' [Platzhalter]' : '';
      console.log(`${location(entry.slots[0])}: #${entry.dex} ${entry.name}${suffix}`);
      for (const slot of entry.slots.slice(1)) console.log(`  ${location(slot)}: weitere Karte`);
    }
  } else if (command === 'add-card') {
    requireArgs(3);
    if (!/^\d+$/.test(args[0])) throw new Error('Die National-Dex-Nummer muss eine positive ganze Zahl sein.');
    const card = addCard(data, Number(args[0]), args[1], args[2]);
    await saveDatabase(databasePath, data);
    console.log(`Karte hinzugefügt: ${card.id}`);
  } else {
    requireArgs(1);
    const card = removeCard(data, args[0]);
    await saveDatabase(databasePath, data);
    console.log(`Karte entfernt: ${card.id}`);
  }
}

main().catch((error) => {
  console.error(`Fehler: ${error.message}`);
  process.exitCode = 1;
});
