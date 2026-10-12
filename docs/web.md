# todo auf dem iPhone

## Überblick

Die Web-App unter <https://task.shubrt.me> bringt die Oberfläche der Mac-App auf das iPhone. Sie ist eine statische Seite, ohne App Store, ohne Service Worker und ohne Offline-Speicher. Wie der Mac spricht sie direkt mit dem einen Convex-Backend und zeigt Änderungen von Mac, API und Integrationen sofort.

Der Code in `apps/web` ist nur die Hülle um die gemeinsame Oberfläche aus `libs/ui`. Er erledigt Anmeldung, Speicherung des Geräteschlüssels und die Prüfung auf neue Versionen. Alles Übrige beschreibt [Desktop](desktop.md) und gilt hier auch, soweit dieser Text nichts anderes sagt.

In einem Desktop-Browser läuft dieselbe Seite mit der Bedienung des Macs, aber ohne Fenstereinstellungen, Emoji-Auswahl und Integrationsschlüssel. Gedacht ist sie für das iPhone.

## Installieren auf dem iPhone

1. In Safari <https://task.shubrt.me> öffnen.
2. Teilen > Zum Home-Bildschirm wählen und den Namen "todo" übernehmen.
3. todo vom Home-Bildschirm starten und anmelden.

Die App läuft dann im Vollbild ohne Safari-Leisten und ist ab dem ersten Bild schwarz. Die Statusleiste liegt durchscheinend über ihr. Safari und die installierte App haben getrennten Speicher. Eine Anmeldung in Safari gilt nicht in der installierten App, legt aber einen eigenen Schlüssel an. Deshalb nur in der installierten App anmelden. Nötig ist iOS 17.4 oder neuer, siehe [Grenzen](#grenzen).

## Anmelden

Ohne gespeicherte Verbindung zeigt die App nur "Melde dich mit Shoo an." und "Mit Shoo anmelden". Der Ablauf gleicht dem am Mac, nur wechselt die ganze Seite zu Shoo, statt einen Browser zu öffnen:

1. Die App erzeugt einen PKCE-Verifier aus 48 Zufallsbytes und einen State `web.<43 Zeichen>`. Beide legt sie mit zehn Minuten Gültigkeit als `todo.login` in localStorage ab.
2. Die Seite wechselt zu `https://shoo.dev/authorize` mit `client_id=origin:<site>`, `redirect_uri=<site>/auth/desktop/callback` und der S256-Challenge, genau wie der Mac. Shoo sieht denselben Client und vergibt dasselbe `sub`. Einen eigenen Eintrag in `SHOO_OWNER_SUBJECTS` braucht das iPhone deshalb nicht.
3. Nach der Anmeldung leitet Shoo auf den Callback der Convex-Site. Der erkennt den `web.`-State und leitet fest auf `<WEB_APP_ORIGIN>/auth/callback` weiter, also `https://task.shubrt.me/auth/callback`. Er reicht nur `code`, `state` und `error` durch.
4. Die App startet neu auf `/auth/callback`. Vor allem anderen ersetzt sie die Adresse durch `/`, damit der Code weder in der Adresszeile noch in der History bleibt. Dann liest und löscht sie `todo.login`, damit jede wartende Anmeldung nur einmal gilt, und prüft Ablaufzeit und State.
5. Code, Verifier und Gerätename gehen an `POST /auth/desktop-login`. Convex tauscht den Code bei Shoo ein, prüft die Besitzerzuordnung und legt einen Geräteschlüssel an.
6. Die App holt mit dem neuen Schlüssel ein JWT. Erst wenn das klappt, speichert sie die Verbindung, widerruft einen ersetzten alten Schlüssel und bittet mit `navigator.storage.persist()` darum, den Speicher nicht zu räumen.

Der Verifier verlässt das iPhone erst beim Codetausch, ein abgefangener Code nützt allein nichts. Einen neuen Schlüssel, den das Backend nicht annimmt oder den die App nicht speichern kann, widerruft sie sofort. Fehler erscheinen rot auf der Anmeldeseite, etwa "Die Anmeldung ist abgelaufen. Bitte versuche es erneut." nach mehr als zehn Minuten oder wie am Mac der fehlende Eintrag für `SHOO_OWNER_SUBJECTS`.

Wer bei Shoo zurückwischt, kommt auf die wartende Seite zurück. Stellt Safari sie aus dem Back-Forward-Cache wieder her, verwirft die App die wartende Anmeldung und lädt neu, damit sie den aktuellen Stand aus dem Speicher liest. Auch nach einer fertigen Anmeldung kann die Geste zurück zu Shoo führen und von dort mit einem alten Code wieder auf `/auth/callback`. Solange die App verbunden ist, übergeht sie einen solchen Rückkehrer ohne wartende Anmeldung. Ohne Verbindung meldet sie "Diese Anmeldung wurde in einem anderen Fenster gestartet. Starte sie in todo erneut." Das passiert auch, wenn die Anmeldung in einem anderen Speicher begonnen hat, etwa in Safari statt in der installierten App.

### Gerätename und Speicher

Der Schlüssel heißt `todo auf iPhone`, in anderen Browsern `todo im Browser`. Der Dev-Server setzt `dev` davor, etwa `todo dev auf iPhone`. Einstellungen > Info > Dieses Gerät zeigt den Namen.

Die App legt drei Einträge in localStorage ab:

| Eintrag           | Inhalt                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `todo.connection` | `{ siteUrl, apiKey }`, der Geräteschlüssel im Klartext                            |
| `todo.login`      | Die wartende Anmeldung mit State, Verifier und Ablaufzeit, höchstens zehn Minuten |
| `todo.sections`   | Welche Abschnitte je Liste aufgeklappt sind                                       |

Gehört eine gespeicherte Verbindung zu einem anderen Backend als dem des Builds, löscht die App sie. JWTs hält sie nur im Arbeitsspeicher und erneuert sie wie der Mac über `POST /auth/device-token`. `navigator.storage.persist()` ruft sie beim Start mit gespeichertem Schlüssel und nach jeder Anmeldung auf, vorher nicht, damit kein Browser schon vor der Anmeldung um Erlaubnis fragt. Ob iOS den Speicher dann hält, entscheidet iOS.

"Abmelden" in den Einstellungen widerruft den Schlüssel per `POST /auth/device-revoke` und leert danach den ganzen localStorage der Seite, auch ohne Netz. Scheitert der Widerruf, bleibt der Schlüssel im Backend aktiv. Während die App einen Code tauscht, lehnt sie das Abmelden ab.

### Schlüssel widerrufen

Auf dem iPhone ist die Schlüsselliste nur zum Lesen, denn der Widerruf braucht `⌘⌫`. Andere Schlüssel, auch den eines verlorenen iPhones, widerruft man auf dem Mac unter Einstellungen > Schlüssel, siehe [Schlüssel](desktop.md#schlüssel). Integrationsschlüssel entstehen nur am Mac.

Geht der Speicher der App verloren, etwa weil sie vom Home-Bildschirm gelöscht wurde oder iOS ihn geräumt hat, ist der Schlüssel auf dem iPhone weg und im Backend noch aktiv. Er zählt weiter zur Grenze von 30 aktiven Schlüsseln, bis man ihn auf dem Mac widerruft. Vor dem Löschen der App deshalb "Abmelden" wählen. Nach einer neuen Anmeldung gibt es zwei Schlüssel `todo auf iPhone`, der verwaiste hat das ältere Datum hinter `seit`.

## Bedienung auf dem iPhone

Die Oberfläche gleicht der am Mac, siehe [Bedienung](desktop.md#bedienung). Auf einem Touch-Bildschirm, erkannt an `(pointer: coarse)`, ändert sich Folgendes. Die Maße sind CSS-Pixel, also Punkt auf dem iPhone.

### Fenster und Seitenleiste

- Wie am Mac öffnet die App beim Start den ersten Favoriten, siehe [Bedienung](desktop.md#bedienung). Jedes Laden der Seite ist ein Start, auch das Neuladen nach einem Deploy unter [Aktualisierung](#aktualisierung).
- Die Titelleiste ist 40 Punkt hoch, sitzt unter der Statusleiste und hat keine Ampelknöpfe. Ein Tipp auf den Titel mit dem kleinen Pfeil öffnet die Listensuche, die am Mac `⌘P` öffnet.
- Der Statuspunkt hat keinen Hover. Ein Tipp zeigt seine Blase zwei Sekunden lang.
- Die Seitenleiste ist 48 Punkt breit. Die Favoriten stehen oben im Abstand von 44 Punkt, unten sitzt das Zahnrad der Einstellungen.
- Unten rechts schwebt über der Liste ein weißer runder Knopf mit schwarzem `+`, 56 Punkt groß und 16 Punkt vom Rand und vom Home-Indikator entfernt. Er legt wie `⌘N` eine Aufgabe oben in Tasks der offenen Liste an, in Habits einen Habit. Aus Wichtig, Verlauf und Wiederholungen wechselt er vorher in die Standardliste. Die Tastatur öffnet sich sofort, auch wenn die Standardliste noch lädt.
- Während einer Bearbeitung und bei offener Schublade fehlt der Knopf. Unter der letzten Zeile bleibt so viel Platz, dass sie sich über den Knopf hinaus scrollen lässt.
- Zeilen sind 36 Punkt hoch. Die Checkbox bleibt 14 Punkt groß, ihre Trefferfläche ist 44 Punkt breit und so hoch wie die Zeile.
- Beim Öffnen einer Liste ist nichts ausgewählt. Die Auswahl ist nur zu sehen, solange eine Schublade oder eine Bearbeitung offen ist.

### Tippen

- Die Checkbox erledigt eine Aufgabe oder öffnet sie wieder. Die Subtask-Zahl wie `0/5` klappt die Subtasks auf und zu.
- Ein Tipp auf eine Aufgabe, einen Habit oder eine Wiederholung macht ihren Titel zum Eingabefeld, wie am Mac `↵` oder ein Doppelklick. Die Tastatur öffnet sich sofort. "Fertig" auf der Tastatur speichert wie `↵`.
- Ein Tipp auf eine andere Zeile speichert den Titel in Arbeit und bearbeitet dann die getippte Zeile. Ein Tipp auf die Zeile, die gerade bearbeitet wird, startet weder eine neue Bearbeitung noch eine Schublade.
- Erledigte Einträge im Verlauf reagieren weder auf Tippen noch auf langen Druck.
- Verwerfen wirkt wie am Mac sofort und ohne Rückfrage.
- Wischaktionen auf Zeilen und Kontextmenüs gibt es nicht.

### Schubladen

Jedes Panel öffnet sich als Schublade am unteren Rand. Sie ist so breit wie der Bildschirm, oben mit 14 Punkt gerundet und hat den Hintergrund `#1c1c1e`. Ein Schleier dunkelt den Rest ab, ein Tipp darauf schließt alle Schubladen. Unten hält die Schublade den Home-Indikator frei. Öffnet sich die Tastatur, rückt sie darüber. Sie reicht höchstens bis unter die Titelleiste, was nicht hineinpasst, scrollt.

Oben sitzt ein Griff. Darunter steht, worauf die Schublade wirkt. Bei den Aktionen einer Aufgabe, beim Datum und bei Verschieben ist das die Aufgabe wie in ihrer Zeile, mit Checkbox in der Farbe ihrer Liste, Titel und Daten wie `morgen`. Sonst steht dort ein Titel, der Name der Liste oder Wiederholung, oder "Einstellungen", auch für Standardliste und Zeitzone. Die Listensuche hat keinen Titel.

Zieht der Finger Griff, Titel oder Suchfeld nach unten, folgt ihm die Schublade. Wer sie mehr als 80 Punkt herunterzieht und loslässt, schließt sie, darunter liegt wieder die vorige. Kürzer gezogen gleitet sie zurück. Der Rest der Schublade scrollt beim Wischen nur. Auch das Wischen vom Rand schließt die oberste Schublade, siehe [Zurückwischen](#zurückwischen).

Zeilen sind 44 Punkt hoch, mit Symbol, Text und rechts einem Wert, 20 Punkt vom Rand. Zwischen den Zeilen liegt eine feine Linie ab dem Text, zwischen Gruppen eine über die ganze Breite. Tastenkürzel fehlen.

**Aktionen einer Aufgabe.** Unter der Aufgabe stehen die Hauptaktionen als Kacheln, vier pro Reihe: Wichtig, KI, Einplanen, Fällig, Später, Verschieben, Backlog und Erledigen. Im Backlog heißt die Kachel Tasks, bei einer heute erledigten Aufgabe heißt die letzte Öffnen. Sind Wichtig oder KI eingeschaltet, ist ihre Kachel heller. Darunter folgen als Zeilen Titel bearbeiten, Unteraufgabe, Einrücken oder Ausrücken, Nach oben, Nach unten und bei überfälligen Aufgaben Normal einordnen. Verwerfen steht rot am Ende. Was erscheint, entscheiden dieselben Regeln wie bei `⌘K`. In Wichtig fehlen Ein- und Ausrücken, Nach oben und Nach unten, bei erledigten Aufgaben Einplanen, Fällig und Später. Einplanen, Fällig, Später und Verschieben öffnen ihre Schublade über dieser.

**Listensuche.** Ein Tipp auf den Titel öffnet oben das Suchfeld "Liste suchen" und darunter die Listen als Kacheln, drei pro Reihe. Jede zeigt Emoji oder Anfangsbuchstaben, Namen und die Zahl offener Aufgaben. Zuerst kommen die Favoriten in der Reihenfolge der Seitenleiste, nach einer Linie die übrigen Listen nach Namen. Die offene Liste hat einen hellen Rahmen. Tippen filtert die Kacheln. Trägt keine Liste genau den getippten Namen, steht darunter "… als neue Liste anlegen". Ein Tipp öffnet eine Liste, ein langer Druck ihre Aktionen.

**Übrige Panels.** Datum, Verschieben, Listenaktionen, Umbenennen, Emoji, Farbe, Einstellungen, Standardliste und Zeitzone zeigen dieselben Zeilen wie am Mac.

- Die Aktionen einer Aufgabe, Wiederholung oder Liste und die Einstellungen haben kein Suchfeld.
- Die übrigen behalten ihr Suchfeld, vorne mit dem Schritt, etwa "Einplanen". Die Tastatur öffnet sich erst beim Tipp darauf, nur die Zeitzone öffnet sie gleich.
- Eine Zeile oder Kachel ist erst markiert, wenn etwas im Suchfeld steht. Dann führt die Eingabetaste der Tastatur die erste aus.

### Langer Druck und Ziehen

Ein langer Druck dauert 450 ms, der Finger darf sich dabei höchstens 8 Punkt bewegen. Wer sich vorher weiter bewegt, scrollt. Dann hebt sich nichts, und nichts öffnet sich.

Auf einem Emoji der Seitenleiste öffnet er die Listenaktionen und ersetzt ein offenes Panel. Auf einer Kachel der Listensuche öffnet er sie über der Suche.

Auf einer Aufgabe, einem Habit oder einer Wiederholung hebt er nur die Zeile an. Was dann geschieht, entscheidet der Finger:

- Loslassen ohne weitere Bewegung wählt die Zeile aus und öffnet ihre Aktionen als Schublade, siehe [Schubladen](#schubladen). Einen Titel in Arbeit speichert die App vorher.
- Bewegt sich der Finger weiter als 8 Punkt, zieht er die Zeile. Die übrigen Zeilen weichen aus, Loslassen speichert die neue Stelle, und keine Schublade öffnet sich. Am oberen und unteren Rand der Liste scrollt sie beim Ziehen mit.
- Lässt sich die Zeile nicht ziehen, legt sie sich bei dieser Bewegung zurück, und nichts öffnet sich.

Den Klick, den iOS nach dem Loslassen schicken kann, verwirft die App. Er startet keine Bearbeitung und schließt keine Schublade.

Für das Ziehen gelten dieselben Grenzen wie für `⌥↑` und `⌥↓`:

- Hauptaufgaben bleiben in ihrem Abschnitt. Nach Backlog und zurück geht es über die Schublade.
- Offene bleiben bei offenen, heute erledigte bei erledigten.
- Subtasks bleiben bei ihrer Hauptaufgabe. Aufgeklappte Subtasks wandern mit ihrer Hauptaufgabe.
- In Für später tauschen nur benachbarte Zeilen desselben Abschnitts.
- In Habits gilt die neue Reihenfolge auch für die folgenden Tage.
- In Wichtig und Wiederholungen zieht nichts, ebenso während einer Bearbeitung und bei einer Zeile ohne passende Nachbarn. Die Schublade öffnet sich dort trotzdem beim Loslassen.

Die neue Reihenfolge erscheint sofort, bevor der Server antwortet. Hat sich die Liste während des Ziehens geändert, etwa vom Mac aus, springt die Zeile zurück und nichts wird gespeichert. Bricht iOS die Geste ab, steht alles wieder am alten Platz, und nichts öffnet sich.

### Zurückwischen

Wischen vom linken Rand schließt das oberste Panel. Dafür legt die App für jedes offene Panel einen Eintrag in der History an. Vorwärtswischen öffnet nichts. Ohne offenes Panel geht die Geste wie in Safari zur vorigen Seite. Direkt nach einer Anmeldung kann das Shoo sein, siehe [Anmelden](#anmelden).

### Datum

Im Datumspanel steht unter den Vorschlägen "Datum wählen …". Ein Tipp darauf öffnet die Datumsauswahl des Systems. Einplanen und Fällig am übernehmen den Tag, sobald er gewählt ist, frühestens heute. Zurückstellen fragt Datum und Uhrzeit ab und übernimmt sie beim Schließen der Auswahl, eine vergangene Zeit ändert nichts. Getippte Angaben wie `mo` oder `15.10.` gehen weiter, nach einem Tipp ins Suchfeld.

### Tastatur und Schrift

Die App folgt dem sichtbaren Bereich über der Tastatur, das bearbeitete Feld bleibt im Bild. Die Schriftgrößen sind fest. iOS zoomt beim Fokus auf ein Feld nicht, Doppeltippen zoomt auch nicht. Langes Drücken zeigt außerhalb von Eingabefeldern weder Callout noch Textauswahl.

### Was auf dem iPhone fehlt

- Tastenkürzel, Tastenkappen und Hinweise wie "⌘N legt eine Aufgabe an."
- Tooltips beim Überfahren
- das Suchfeld der Einstellungen
- der Widerruf in der Schlüsselliste und "Neuer Integrationsschlüssel"
- der Abschnitt Fenster, das Menüleistenmenü und das Ausblenden des Fensters
- die Emoji-Auswahl von macOS. An ihrer Stelle steht "Emoji über die Tastatur eingeben". Ein Tipp ins Suchfeld und die Emoji-Taste der Tastatur ersetzen sie.

Unter Info steht "Dieses Gerät" statt "Dieser Mac".

## Aktualisierung

Einen Service Worker gibt es nicht. Caddy liefert `index.html` mit `Cache-Control: no-cache`, jeder Start holt also die aktuelle Fassung. Die Dateien unter `/assets/` tragen einen Hash im Namen und gelten ein Jahr als unveränderlich.

Damit auch eine offene App einen Deploy bemerkt, schreibt der Build `/version.json` mit `{ "version": "<kennung>" }` und kompiliert dieselbe Kennung in die App. Kommt die App in den Vordergrund, lädt sie `/version.json` am Cache vorbei. Weicht die Version ab und ist nichts offen, lädt sie neu. Offen heißt ein Panel, eine Bearbeitung oder ein laufender Codetausch. Dann wartet sie bis zum nächsten Wechsel in den Vordergrund. Ohne Netz passiert nichts. Einstellungen > Info > Version zeigt die Kennung.

Die Kennung entsteht beim Build. Die erste vorhandene Quelle gilt:

1. `TODO_WEB_VERSION`
2. die ersten 12 Zeichen von `RAILWAY_GIT_COMMIT_SHA`, auf Railway also der Commit
3. `git rev-parse --short=12 HEAD`
4. die Bauzeit in Base36

Im Docker-Build fehlt `.git`, ohne Railway-Variable gilt dort die Bauzeit. Der Dev-Server verwendet `dev` und prüft nicht auf neue Versionen.

## Hosting

Die App läuft auf Railway im Projekt "task", Service `web`, unter der eigenen Domain <https://task.shubrt.me>. Railway ist mit dem GitHub-Repository verbunden und baut neu, sobald sich `main` ändert. Einen Deploy-Befehl gibt es nicht, der Merge nach `main` ist der Deploy.

Die Build-Einstellungen stehen im Dienst, nicht im Repository. Railway hat `railway.json` abgekündigt, die Datei wirkt nur bis zum 1. Dezember 2026.

- Die Dienstvariable `RAILWAY_DOCKERFILE_PATH` lässt Railway mit `apps/web/Dockerfile` bauen. Build-Kontext ist das ganze Repository.
- Jeder Push auf `main` baut neu, auch reine Mac- oder Doku-Änderungen. Die neue Version hat einen anderen Commit, eine offene App lädt deshalb beim nächsten Wechsel in den Vordergrund einmal neu.

Das Dockerfile baut in zwei Stufen. Die erste nutzt `node:24`. Mit `node:24-slim` bricht Vite+ ab, weil dort die CA-Zertifikate fehlen. Corepack holt pnpm in der Version aus `packageManager`, `pnpm install --frozen-lockfile --filter @todo/web...` installiert nur die Web-App mit ihren Paketen, ohne Electron. `pnpm --filter @todo/web build` baut nach `apps/web/dist`. Die zweite Stufe ist `caddy:2-alpine` mit `apps/web/Caddyfile` und den gebauten Dateien in `/srv`. `.dockerignore` hält `.git`, `node_modules`, Builds und alle `.env*`-Dateien außer `.env.example` aus dem Build.

Service-Variablen in Railway:

| Variable                  | Inhalt                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PORT`                    | `8080`, darauf lauscht Caddy                                                                                   |
| `CONVEX_SITE_URL`         | Site-URL des Produktionsbackends wie in `.env`. Der Build kompiliert sie in App und CSP und bricht ohne sie ab |
| `RAILWAY_DOCKERFILE_PATH` | `apps/web/Dockerfile`                                                                                          |

`RAILWAY_GIT_COMMIT_SHA` setzt Railway selbst. Das Dockerfile nimmt `CONVEX_SITE_URL` und `RAILWAY_GIT_COMMIT_SHA` als `ARG` in den Build.

Railway beendet TLS, Caddy antwortet dahinter auf `PORT`:

| Pfad                    | Antwort                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `/`, `/auth/callback`   | `index.html` mit HTTP 200 und `Cache-Control: no-cache`                       |
| `/assets/*`             | `public, max-age=31536000, immutable`, eine fehlende Datei 404 mit `no-cache` |
| `/version.json`         | `no-store`                                                                    |
| `/manifest.webmanifest` | `Content-Type: application/manifest+json`, `no-cache`                         |
| alle übrigen Pfade      | die Datei mit `no-cache`, sonst 404                                           |

Alle Antworten tragen `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` und `Strict-Transport-Security: max-age=31536000`. Caddy komprimiert mit zstd oder gzip, seine Admin-API ist aus. Die übrige CSP steht als Meta-Tag in `index.html`, weil sie die Backend-Adressen aus dem Build braucht. Sie erlaubt Skripte nur von der eigenen Origin und keine Inline-Skripte. Verbindungen gehen nur an die eigene Origin, die Convex-Site und das zugehörige `.convex.cloud` über HTTPS und WebSocket. Dazu kommen `object-src 'none'`, `base-uri 'none'` und `form-action 'none'`. `no-referrer` steht zusätzlich als Meta-Tag, damit die Adresse mit dem Code aus `/auth/callback` nicht als Referrer weitergeht.

Die Domain liegt bei Cloudflare. Dort steht ein CNAME für `task` auf das Ziel, das Railway für die Domain anzeigt, mit ausgeschaltetem Proxy ("DNS only"). Dazu kommt der TXT-Eintrag, mit dem Railway den Besitz der Domain prüft. Railway stellt das Zertifikat aus. Mit Proxy könnte Cloudflare Skripte wie Rocket Loader einfügen, die die CSP blockieren würde.

### Image lokal prüfen

```sh
docker build -f apps/web/Dockerfile \
  --build-arg CONVEX_SITE_URL=https://<deployment>.<region>.convex.site \
  --build-arg RAILWAY_GIT_COMMIT_SHA="$(git rev-parse HEAD)" \
  -t todo-web-check .
docker run --rm -e PORT=8080 -p 18080:8080 todo-web-check
```

In einem zweiten Terminal die Header prüfen und das Image danach mit `docker image rm todo-web-check` löschen:

```sh
curl -sI http://localhost:18080/
curl -sI http://localhost:18080/auth/callback
curl -sI http://localhost:18080/version.json
curl -sI http://localhost:18080/assets/fehlt.js
```

Die Antworten müssen der Tabelle oben entsprechen. `curl -s http://localhost:18080/version.json` zeigt die ersten 12 Zeichen des Commits.

## Entwicklung

```sh
vp run dev:web
vp run build:web
vp run @todo/web#preview
```

`dev:web` startet den Vite-Dev-Server von `apps/web`, Vite wählt den Port ab 5173. Die Version heißt `dev`, der Titel trägt den Hinweis `dev`, und die Prüfung auf neue Versionen ist aus. Die CSP erlaubt dort Inline-Skripte und `ws:` für HMR. `build:web` baut nach `apps/web/dist` und schreibt `version.json`, `preview` liefert diesen Build lokal aus.

`CONVEX_SITE_URL` kommt aus der Shell, sonst aus `.env` im Repository-Root. Ohne gültige `convex.site`-Adresse brechen `dev:web` und `build:web` ab, denn die CSP braucht die genauen Hosts. Erlaubt sind `https://NAME.convex.site` und `https://NAME.REGION.convex.site`. `vp run qa` baut die Web-App nicht und braucht den Wert nicht. `vp test run apps/web` prüft Anmeldung, Plattform und Aktualisierung, siehe [Verifikation](verification.md).

Lokal kann sich die Web-App nicht anmelden, und das ist gewollt. `WEB_APP_ORIGIN` ist nur `https://task.shubrt.me`. Der Callback schickt jede Web-Anmeldung dorthin, und CORS erlaubt nur diese Origin. Eine Ausnahme für localhost oder eine LAN-Adresse gibt es nicht. Lokal sieht man deshalb nur die Anmeldeseite.

Touch-Arbeit läuft in der Electron-Dev-Variante. `vp run dev` starten, über das Menü "Darstellung" oder `⌥⌘I` die Entwicklertools öffnen und dort den Gerätemodus mit einem iPhone-Profil einschalten. Das Fenster meldet dann `(pointer: coarse)` und zeigt die Touch-Oberfläche gegen das echte Backend, angemeldet wie die Dev-Variante. Nach dem Umschalten neu laden, weil die App manche Werte nur beim Start liest. Änderungen in `libs/ui` kommen per HMR. Tastatur, Safe Areas, Gesten und Speicher von iOS zeigt nur ein echtes iPhone, siehe [Verifikation](verification.md#iphone).

### Icon

Die Icons liegen in `apps/web/public`: `apple-touch-icon.png` mit 180 × 180 Pixeln, `icon-192.png`, `icon-512.png` und `favicon.svg`. Alle zeigen das Lucide-Symbol `check` in Weiß auf deckendem Schwarz, Pfad `M20 6 9 17l-5-5`, Strichstärke 2, runde Enden. Die 24er-Box des Symbols nimmt 56 % der Kantenlänge ein, der Haken sitzt in der Mitte. Das Skript, das die PNGs gezeichnet hat, liegt nicht im Repository. Wer das Icon ändert, erzeugt alle vier Dateien nach dieser Beschreibung neu. `manifest.webmanifest` nennt Name, Farben und die beiden großen PNGs.

## Grenzen

- **iOS 17.4 oder neuer.** Der Verlauf gruppiert seine Tage mit `Map.groupBy`, das Safari erst ab 17.4 kennt.
- **WebKit-Bug 301994.** In installierten Web-Apps bleibt die Statusleiste sichtbar. `env(safe-area-inset-top)` liefert 0, ein fester Streifen liegt oben und schiebt den Inhalt nach unten, die Farbe am unteren Rand ändert sich erst nach einem Neustart der App. Gemeldet wurde der Bug für iOS 26.1. Mit 26.2 war er behoben, in 26.5.2 und in der Beta von iOS 27 ist er zurück, seit August 2026 ist er wieder offen. Einen Workaround gibt es nicht. Die App ist ab dem ersten Bild schwarz und funktioniert auch mit einem Abstand von 0. Ein Streifen oben ist dann der Bug, kein Fehler der App.
- **Kein Offline-Modus.** Ohne Service Worker startet die App nur mit Netz. Fehlt die Verbindung später, sperrt sie Änderungen wie der Mac.
- **Geräteschlüssel in localStorage.** Der Schlüssel liegt im Klartext im Speicher der Seite und läuft nie ab. Jedes Skript auf `task.shubrt.me` könnte ihn lesen. Schutz bieten nur die strikte CSP ohne Inline- und Fremdskripte und der Host. Wer Railway, das Repository, die Domain oder ihren DNS-Eintrag kontrolliert, kann Code ausliefern, der ihn liest. Mit dem Schlüssel lassen sich alle Aufgaben lesen und ändern und andere Schlüssel widerrufen, neue Schlüssel aber nur mit einer frischen Shoo-Anmeldung anlegen. Bei Verdacht den Schlüssel auf dem Mac widerrufen.
- **Speicher.** Ob iOS den Speicher auf Dauer hält, steht in der Checkliste unter [Verifikation](verification.md#iphone) noch aus. Geht er verloren, bleibt ein verwaister Schlüssel, siehe [Schlüssel widerrufen](#schlüssel-widerrufen).
- **Keine lokale Anmeldung,** siehe [Entwicklung](#entwicklung).
