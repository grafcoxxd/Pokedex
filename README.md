# Pokémon-Binder

Diese lokale Web-Testanwendung verwaltet die übermittelte Binderliste und berechnet Standorte bei jeder Abfrage neu. Sie benötigt Node.js 20 oder neuer und keine zusätzlichen Pakete. QR-Codes sind noch nicht implementiert.

## Start

In PowerShell im Projektordner starten:

```powershell
npm start
```

Anschließend im Browser auf demselben Rechner **http://127.0.0.1:3000** öffnen. Im Terminal beendet `Strg+C` den Server. Beim ersten Start wird `collection.json` aus den Startdaten erzeugt; eine bestehende Sammlung wird verwendet und nicht überschrieben. Die Datei enthält deine Sammlung; sichere sie regelmäßig.

Die Oberfläche bietet Binderübersichten, Suche über alle Binder nach Name oder National-Dex-Nummer, Standorte und Platzhalter sowie das Hinzufügen und Entfernen von Karten über die Pokémon-Details. Die Binder erscheinen als Bücher mit den zugehörigen Regionskarten und der Anzahl der enthaltenen Karten; reservierte Fächer und Platzhalter zählen nicht als Karten. Die Pokémon-Liste lädt Sprites aus dem [PokéAPI-Sprites-Projekt](https://github.com/PokeAPI/sprites): bis einschließlich Generation 4 aus HeartGold/SoulSilver, für Generation 5 aus Schwarz/Weiß und für spätere Pokémon die verfügbaren Standardsprites. Platzhalter-Sprites sind ausgegraut; fehlende Sprites werden sichtbar gekennzeichnet. Eine Binderübersicht zeigt die Einträge in ihrer Reihenfolge; die Paginierung der Liste ist unabhängig von den physischen Binderseiten.

### Pokédex

Die Pokémon-Detailansicht zeigt unter dem Binderstandort einen Pokédex-Eintrag mit Illustration, deutschem Beschreibungstext, Größe, Gewicht, Kategorie, Fähigkeiten, Typen, Schwächen, Basiswerten und der verzweigten Entwicklungsfamilie. Mit „Zurück“ oder der Zurück-Funktion des Browsers gelangst du zur Sammlung zurück. Der Ruf der Standardform lässt sich per Knopfdruck abspielen, sofern er verfügbar ist. Bei verfügbaren Familienmitgliedern öffnen die Entwicklungsbilder deren Detailansicht. Die Angaben stammen aus [PokéAPI](https://pokeapi.co/), die Illustrationen aus dem [PokéAPI-Sprites-Projekt](https://github.com/PokeAPI/sprites) und die Rufe aus dem [PokéAPI-Cries-Projekt](https://github.com/PokeAPI/cries). Sie werden online geladen; bei Fehlern kann erneut versucht werden. Im laufenden Server werden erfolgreiche API-Antworten vorübergehend zwischengespeichert.

Angezeigt wird die Standardform der Pokémon-Art. Der deutsche Beschreibungstext stammt aus einer verfügbaren Spielversion. Verfügbare Kategorien werden einheitlich mit „-Pokémon“ angezeigt. Die Schwächen basieren auf der aktuellen Typenmatrix der Videospiele, einschließlich doppelter und vierfacher Schwächen, ohne Berücksichtigung von Fähigkeiten; sie sind nicht die Schwächen einer konkreten Sammelkarte. Die Balken zeigen Basiswerte auf einer Skala bis 255. Daten und Illustrationen können im Katalog fehlen oder sich ändern.

Die Felder für Dex-Nummer, Angaben und Entwicklungen übernehmen die Typfarben der angezeigten Standardform. Bei zwei Typen steht der erste oben links und der zweite unten rechts. Für lesbare Schrift werden die Flächen leicht abgedunkelt; bei den hellen Typen Normal, Psycho und Flug sorgen stattdessen dunkle Schrift und bei Kombinationen mit dunkleren Typen helle Textflächen für Kontrast. Auf schmalen Bildschirmen stehen die Basiswerte unter den Schwächen und vor den Entwicklungen. Eingabefelder verwenden auf schmalen Bildschirmen und Touchgeräten mindestens 16 Pixel Schriftgröße, damit mobile Browser beim Antippen nicht automatisch hineinzoomen; manuelles Zoomen bleibt möglich.

### Kartenbilder

Wähle **+ Karte hinzufügen** oberhalb der Binder, um eine Karte ohne vorherige Pokémon-Suche hinzuzufügen. Gib Setname oder Setkürzel und die aufgedruckte Kartennummer ein, beispielsweise `001/189`, und wähle die Sprache. Wähle den passenden Katalogtreffer; die App ermittelt das Pokémon anhand der National-Dex-Nummer des Katalogs und zeigt es vor dem Speichern zur Bestätigung an. Für PTCG-card-data ohne Dex-Nummer wird bei einem einfachen englischen Pokémonnamen zusätzlich [PokéAPI](https://pokeapi.co/) abgefragt und der Name exakt verglichen. Ist die Zuordnung unklar oder sind mehrere Pokémon angegeben, wähle das Pokémon selbst. Pokémon außerhalb der vorhandenen Binder können nicht hinzugefügt werden. Auch Trainer- und Energiekarten besitzen keinen Pokémon-Binderplatz; nicht eindeutig erkannte Treffer müssen sorgfältig geprüft werden.

Nach dem Bestätigen belegt die erste Karte das reservierte Fach des Pokémon, weitere Karten folgen unmittelbar dahinter; spätere Einträge rücken weiter. Die Suche bleibt geöffnet: Set und Sprache bleiben stehen, die Kartennummer wird für die nächste Karte geleert. Alternativ öffne ein Pokémon und wähle dort **Karte hinzufügen**; auch hier bleibt die Suche nach dem Hinzufügen geöffnet. Bereits erfasste Karten ohne Bildverknüpfung können weiterhin über **Bild suchen** verknüpft werden.

Die Suche bei [TCGdex](https://tcgdex.dev/) unterstützt Deutsch, Englisch, Japanisch, Koreanisch und traditionelles sowie vereinfachtes Chinesisch. Vor und nach dem Schrägstrich werden bei Zahlen führende Nullen ignoriert. Die Suche vergleicht den Teil vor `/`; falls die Quelle die vollständige Nummer einschließlich `/` enthält, wird auch der zweite Teil verglichen. Andernfalls wird dieser ausdrücklich als nicht überprüft markiert. Setgrößen werden nicht als Filter verwendet. Auch Sondernummern wie `TG12` können gesucht werden. Passende Sets werden je Katalog in Gruppen von 15 durchsucht; mit **Weitere Sets** sind zusätzliche Ergebnisse erreichbar.

Für vereinfachtes Chinesisch wird zusätzlich **PTCG-card-data** automatisch durchsucht. Dort wird nur die Nummer vor `/` verglichen; Angaben nach `/` und die Pokémon-Zuordnung werden nicht automatisch verifiziert. Beispielsweise findet `0901/07` im Set `CBB4C` einen Panferno-Eintrag. Vergleiche jeden Treffer vor dem Speichern mit deiner Karte. Ist eine Quelle nicht erreichbar, werden Ergebnisse anderer Quellen mit einem entsprechenden Hinweis angezeigt.

Bei Koreanisch werden zusätzlich japanische Vergleichskarten gesucht. Sie sind ausdrücklich gekennzeichnet und keine verifizierten koreanischen Originalausgaben: gleiche Nummern oder Sets garantieren keine Übereinstimmung. Prüfe den Treffer selbst. Die App speichert die tatsächliche Kartensprache Koreanisch getrennt von der japanischen Katalogsprache und kennzeichnet die Verknüpfung als Vergleich. Beispiel: `041/081` mit Set `M5` findet die japanische Rasaff-Vergleichskarte; der Teil nach `/` ist dabei nicht verifiziert.

Fehlt ein Bild in der ursprünglichen Sprache oder kann es nicht geladen werden, sucht die App nach einer deutschen Ausgabe. Bei TCGdex wird zunächst dieselbe Karten-ID verwendet. Falls dies kein Bild liefert, werden deutsche Karten anhand von Dex-Nummer, Illustrator, KP und Entwicklungsstufe verglichen; nur bei genau einem passenden Treffer mit Bild wird ein Vorschlag angezeigt. Diese Merkmale beweisen keine Motivgleichheit. Bei PTCG-card-data werden die englischen Referenzangaben der Quelle über die [Setliste von Pokémon TCG Data](https://github.com/PokemonTCG/pokemon-tcg-data) einer deutschen TCGdex-Karte zugeordnet. Das Ergebnis wird als **deutsches Ersatzbild** gekennzeichnet: Motiv, Druck oder Variante können von deiner Karte abweichen. Die ursprüngliche Kartenverknüpfung bleibt unverändert. Ersatzbilder werden beim Anzeigen online gesucht und nicht dauerhaft gespeichert.

Die chinesische Ergänzung stammt aus [PTCG-card-data](https://github.com/zsjy947/PTCG-card-data), laut Projektbeschreibung aus Daten von mik.moe; die Projektlizenz CC0 bezieht sich auf die Zusammenstellung, nicht auf Kartenbilder oder Marken. Die Daten werden bei Bedarf über GitHub geladen.

Eine Verknüpfung speichert die Katalog-ID, Sprache, den Kartennamen und ggf. die Bildadresse, ohne die manuell eingegebenen Angaben oder den Binderplatz zu verändern. Prüfe den Treffer selbst: Die Zuordnung wird nicht automatisch ermittelt; wenn die API eine abweichende oder keine Dex-Nummer meldet, erscheint vor dem Speichern eine Warnung. Auch Varianten eines Kartenmotivs lassen sich nicht immer unterscheiden. Die Abdeckung bei TCGdex ist je nach Sprache und Set unterschiedlich; insbesondere asiatische Setlisten können leere Kartenlisten oder fehlende Bilder enthalten. Eine andere Sprache oder ein anderer Suchbegriff kann helfen. Unter **Katalog ändern** kann eine Karte neu verknüpft werden.

Die Suche benötigt Internetzugang: Der Server ruft Setlisten und passende Sets von TCGdex bzw. GitHub ab; bei der allgemeinen Suche kann zusätzlich der englische Kartenname an PokéAPI übertragen werden. Bilder lädt der Browser direkt von TCGdex; sie sind nicht lokal gespeichert und bleiben ohne Internet ggf. nicht sichtbar.

Der Server ist absichtlich nur auf diesem Rechner erreichbar, ohne Anmeldung und ausschließlich als lokale Testversion gedacht. Zugriff vom Smartphone oder übers Internet ist noch nicht eingerichtet. Der Port kann über `PORT`, der Pfad zur Datenbank über `BINDER_DB` geändert werden. Beispiel:

```powershell
$env:PORT = "3001"
npm start
```

### Alternative: Kommandozeile

```powershell
node src/cli.js search Galagladi
node src/cli.js search 475
node src/cli.js binder Hoenn
```

Falls die Sammlung noch nicht existiert, legt `node src/cli.js init` sie an, ohne eine bestehende Datei zu überschreiben.

## Karten verwalten

```powershell
node src/cli.js add-card 133 "Basis Set" "55/102"
node src/cli.js search Evoli
node src/cli.js remove-card <Karten-ID>
```

Die Karten-ID wird beim Hinzufügen und bei der Suche ausgegeben. Jede Eingabe erzeugt ein eigenes Exemplar, auch wenn Set und Kartennummer identisch sind. In der Kommandozeile muss die National-Dex-Nummer **manuell** angegeben werden. Die Kartennummer allein identifiziert eine Karte nicht zuverlässig über verschiedene Sets hinweg; Set und Kartennummer werden deshalb getrennt gespeichert.

## Sortierung und Standorte

- Die Startdaten enthalten die vom Nutzer vorgegebene Reihenfolge aller vier Binder, einschließlich später eingeführter Familienmitglieder und Platzhalter. Sie ist maßgeblich; die Anwendung leitet Evolutionsfamilien und die Reihenfolge noch nicht automatisch aus einer externen Quelle ab.
- Ein Pokémon ohne Karte reserviert ein Fach. Bei einer oder mehreren Karten belegt jedes Exemplar ein Fach; die erste Karte ist der Anhaltspunkt für seinen Standort. Exemplare stehen in der Reihenfolge ihrer Erfassung.
- Ein Platzhalter belegt genau ein Fach, unabhängig von der Anzahl der Karten im Heimat-Binder. Er ist selbst keine Karte.
- Jede nutzbare Seite zählt einzeln und hat neun Fächer. Steckplätze 1–9 laufen zeilenweise von links oben nach rechts unten. Einträge beginnen auf Seite 1, Steckplatz 1.
- Vorläufig hat jeder Binder 40 Seiten bzw. 360 Fächer. Die Grenze berücksichtigt reservierte Fächer und Platzhalter. Bei vollem Binder wird das Hinzufügen einer Karte abgelehnt, wenn dafür ein weiteres Fach erforderlich wäre. Die erste Karte eines bisher leeren Pokémon passt weiterhin in dessen bereits reserviertes Fach.
- Hinzufügen oder Entfernen einer Karte verschiebt alle folgenden Einträge im selben Binder. Querverweise zeigen stets den aktuell berechneten Standort. Andere Binder ändern sich dadurch nicht.

Beispiel mit leerer Sammlung: Galagladi steht in Hoenn auf Seite 4, Steckplatz 6; sein Platzhalter steht in Sinnoh auf Seite 10, Steckplatz 8. Tatsächliche Standorte können bei bereits gefüllten Bindern abweichen.

## Datenmodell

`data/seed.json` enthält die unveränderliche Vorlage, `collection.json` den nutzbaren Datenstand:

- `binders`: Binder-ID und Regionsname, mit einer geordneten Liste von Einträgen. Jeder Eintrag enthält National-Dex-Nummer `dex`, deutschen Namen und den Typ `home` oder `placeholder`. Pro Pokémon gibt es genau einen `home`-Eintrag; Platzhalter verweisen über dieselbe Dex-Nummer darauf.
- `cards`: einzelne Kartenexemplare mit eindeutiger ID, Dex-Nummer, Set und Kartennummer sowie optionaler tatsächlicher Kartensprache `cardLanguage`. Die Sprache einer Katalogverknüpfung bezeichnet dagegen die Quelle und kann bei Vergleichskarten abweichen. Die Reihenfolge bestimmt die Sortierung der Exemplare innerhalb eines Pokémon.
- Seiten und Steckplätze werden aus Eintragsreihenfolge und Kartenanzahl berechnet und nicht redundant gespeichert.

Die Vorlage deckt die gelieferten vier Binder ab, nicht alle Pokémon oder Binder späterer Generationen. Der Webserver reiht seine eigenen Schreibvorgänge ein; gleichzeitiges Schreiben durch mehrere Server oder die Kommandozeile wird nicht synchronisiert. Die JSON-Datei ist für die lokale Nutzung gedacht. Für eine spätere Mehrbenutzer-Web-App sind insbesondere Speicherung, Synchronisierung und Zugriffsschutz neu zu gestalten.

Tests ausführen:

```powershell
npm test
```
