# todo für macOS

Die Desktop-App ist der einzige Client. Sie zeigt die Convex-Aufgaben in einem kleinen schwebenden Fenster nach dem Vorbild der Raycast Notes. Einen zweiten Markdown-Bestand oder einen Offline-Aufgabenspeicher gibt es nicht.

## Starten und bauen

Voraussetzungen sind der installierte Workspace, Node 24 und macOS auf Apple Silicon. In `.env` im Repository-Root steht `CONVEX_SITE_URL`, die Site-URL des Convex-Deployments, etwa `https://dein-projekt.convex.site`. `scripts/build.mjs` liest die Datei und kompiliert den Wert in den Main-Prozess. Eine gleichnamige Variable aus der Shell hat Vorrang. Nach einer Änderung die App neu bauen. Fehlt der Wert oder ist er ungültig, scheitert die Anmeldung mit einem Hinweis auf `CONVEX_SITE_URL`. Ein neuer Worktree hat keine `.env`. Die Datei aus dem Haupt-Checkout kopieren oder `CONVEX_SITE_URL` in der Shell setzen.

```bash
vp run dev
vp run build
vp run package
```

Die Root-Befehle rufen `dev`, `build` und `package` von `@todo/desktop` auf. Im Verzeichnis `apps/desktop` gehen auch `node scripts/dev.mjs`, `node scripts/build.mjs` und `node scripts/package.mjs`.

`dev` baut Main und Preload, startet einen lokalen Vite-Server und öffnet das Electron-Fenster. Rendereränderungen erscheinen per HMR, Änderungen an Main oder Preload brauchen einen Neustart des Befehls. Jeder Worktree startet als eigene Variante mit dem Branchnamen, etwa `todo login-fix` mit `✓ login-fix` im Tray. Eine Variante hat eigene Daten und damit eine eigene Anmeldung, keinen globalen Kurzbefehl und endet mit dem Dev-Befehl. Jede Anmeldung in einer Variante legt einen eigenen Geräteschlüssel an, der nie abläuft. Das Löschen des Worktrees widerruft ihn nicht. Vorher in der Variante "Verbindung entfernen" wählen. Einen vergessenen Schlüssel widerruft man in einer anderen angemeldeten App unter Einstellungen > Schlüssel, siehe [Schlüssel](#schlüssel). `TODO_DESKTOP_VARIANT=<name>` überschreibt den Namen und erzeugt bei `package` eine getrennte App neben der normalen.

Der Paketbefehl erstellt:

- `apps/desktop/release/todo-darwin-arm64/todo.app`
- `apps/desktop/release/todo-0.2.0-mac-arm64.zip`

Das Paket wird lokal gebaut und weder installiert noch hochgeladen. Es hat keine Developer-ID-Signatur und keine Apple-Notarisierung. Für eine spätere Verteilung fehlt dieser Schritt mit einem passenden Apple-Zertifikat. Eine gleichbleibende Signatur erspart außerdem Schlüsselbund-Rückfragen nach Updates. Buildwerkzeuge und Electron-Version stehen fest im Paketmanifest. Wegen der ZIP-Zeitstempel sind zwei Builds trotzdem nicht byteidentisch.

## Anmelden

Ohne gespeicherte Verbindung zeigt das Fenster die Anmeldung. Der Ablauf:

1. Der Main-Prozess öffnet einen HTTP-Listener auf `127.0.0.1` mit zufälligem Port. Er erzeugt einen PKCE-Verifier aus 48 Zufallsbytes und einen State der Form `<port>.<zufall>`.
2. Der Standardbrowser öffnet `https://shoo.dev/authorize` mit `client_id=origin:<site>`, `redirect_uri=<site>/auth/desktop/callback` und der S256-Challenge.
3. Nach der Anmeldung leitet Shoo auf `GET /auth/desktop/callback` der Convex-Site. Der Endpunkt prüft das Format des State und leitet mit HTTP 302 an `http://127.0.0.1:<port>/callback` weiter. Dabei reicht er nur `code`, `state` und `error` durch.
4. Die App vergleicht den State und schickt Code, Verifier und einen Gerätenamen wie `todo auf <Rechnername>` an `POST /auth/desktop-login`.
5. Convex tauscht den Code bei Shoo ein, prüft ID-Token und Besitzerzuordnung und legt einen Geräteschlüssel mit diesem Namen an.
6. Die App speichert Site-URL und Schlüssel verschlüsselt und verbindet sich.

Die Anmeldung lässt sich im Fenster abbrechen. Kommt der Browser nicht innerhalb von zehn Minuten zurück, bricht sie selbst ab. Wer erst nach der Rückkehr aus dem Browser abbricht, wartet den laufenden Codetausch ab. Die App speichert den neuen Schlüssel dann nicht und widerruft ihn. Eine erneute Anmeldung ersetzt den gespeicherten Schlüssel und widerruft den alten.

Der Umweg über Convex hält die Shoo-Identität stabil. Shoo vergibt das `sub` pro Origin der Redirect-URI. `todo://` hat keine verwendbare Origin, und ein zufälliger Loopback-Port würde das `sub` bei jeder Anmeldung ändern. Der Verifier bleibt bis zum Codetausch auf dem Mac, ein abgefangener Code ist ohne ihn wertlos.

Bei der ersten Anmeldung kennt das Backend das `sub` noch nicht und antwortet mit HTTP 403. Die Fehlermeldung enthält genau den Eintrag für `SHOO_OWNER_SUBJECTS`, etwa `{"https://dein-projekt.convex.site":"ps_…"}`. Nach dem Eintragen in der Convex-Umgebung erneut anmelden, ein Deploy ist nicht nötig. Die Schritte stehen in [Entwicklung](development.md#erstes-backend-deployment).

## Verbindung und Speicherung

Die App legt den Zugang als `{ siteUrl, apiKey }` in `connection.enc` unter dem Electron-Nutzerverzeichnis ab, auf macOS normalerweise `~/Library/Application Support/todo/`. Varianten verwenden `~/Library/Application Support/todo-<variante>/`. Electron `safeStorage` verschlüsselt die Datei mit dem macOS-Schlüsselbund. Ist der Schlüsselbund nicht verfügbar, speichert die App nichts, auch keinen Klartext. Über die Preload-Schnittstelle bekommt der Renderer den Verbindungsstatus, die öffentliche Site-URL, Fenstereinstellungen, kurzlebige JWTs und einmalig jeden neu erzeugten Integrationsschlüssel. Den Geräteschlüssel bekommt er nie.

Für Live-Daten tauscht der Main-Prozess den Schlüssel gegen ein JWT:

```http
POST /auth/device-token
Authorization: Bearer todo_<geräteschlüssel>
```

Die Antwort `{ "token": "<JWT>", "expiresAt": 1788600300000 }` hat keine `data`-Hülle. `expiresAt` ist eine UTC-Unixzeit in Millisekunden. Das ES256-JWT gilt höchstens fünf Minuten. `sub` ist der Owner, `apiKeyId` der Geräteschlüssel, die Audience `todo`. `createTokenProvider` aus `@todo/native-client` hält das JWT nur im Arbeitsspeicher, erneuert es bei weniger als 30 Sekunden Restlaufzeit und bündelt gleichzeitige Abrufe. Bei HTTP 401 liefert er `null`. Die App zeigt dann "Noch keine Verbindung." mit dem Hinweis, dass der Geräteschlüssel abgelaufen ist oder widerrufen wurde. "Neu anmelden" startet die Anmeldung. Netzwerk- und Serverfehler werfen `NativeApiError` und löschen keinen gespeicherten Schlüssel.

"Verbindung entfernen" widerruft den Schlüssel per `POST /auth/device-revoke` und löscht danach `connection.enc`. Der Widerruf ist ein Versuch ohne Garantie. Scheitert er, etwa ohne Netz, bleibt der Schlüssel im Backend aktiv und zählt weiter zur Grenze von 30 aktiven Schlüsseln. Aufgaben im Backend bleiben in jedem Fall unverändert.

Geräteschlüssel laufen nicht ab. Ein Schlüssel bleibt aktiv, bis "Verbindung entfernen", eine erneute Anmeldung in derselben App oder ein Widerruf unter Einstellungen > Schlüssel ihn beendet. Liegengebliebene Schlüssel stammen vor allem von Varianten gelöschter Worktrees, seltener von gescheiterten Widerrufen. Ihr Name nennt App und Rechner, etwa `todo login-fix auf <Rechnername>`.

Fensterposition, Größe, Farbe, Kurzbefehl und Autostartpräferenz liegen getrennt davon in `window.json`. Diese Datei enthält weder Aufgaben noch Zugangsdaten.

## Schlüssel

Einstellungen > Schlüssel listet alle aktiven Schlüssel des Besitzers in drei Gruppen:

| Gruppe        | `kind`        | Entsteht                                      | Gilt für                                     |
| ------------- | ------------- | --------------------------------------------- | -------------------------------------------- |
| Geräte        | `device`      | Bei der Anmeldung einer App oder Variante     | `/auth/device-token` und `/api/v1`           |
| Integrationen | `integration` | Über "Neuer Integrationsschlüssel"            | Nur `/api/v1`, `/auth/device-token` gibt 403 |
| Ohne Typ      | fehlt         | Vor Einführung der Arten, etwa in der Web-App | Wie Geräteschlüssel                          |

Jede Zeile zeigt Name, Präfix und Erstelldatum. Der Schlüssel der eigenen App trägt "Dieser Mac" und lässt sich nur über "Verbindung entfernen" widerrufen. Bei allen anderen erscheint ein Papierkorb, wenn der Mauszeiger über der Zeile steht oder sie den Tastaturfokus hat. Ein Klick widerruft sofort und ohne Rückfrage. Convex liest die Schlüsselzeile bei jedem Zugriff, eine widerrufene App verliert deshalb auch ihre laufenden Abonnements.

Höchstens 30 Schlüssel aller Arten dürfen gleichzeitig aktiv sein. Widerrufene und abgelaufene zählen nicht mit. Ablaufen können nur alte Schlüssel ohne Typ, abgelaufene stehen auch nicht in der Liste. Die Fußzeile zeigt "N von 30 aktiv". Bei 30 ist "Neuer Integrationsschlüssel" gesperrt, und das Backend lehnt jede weitere Anmeldung mit "Es sind höchstens 30 aktive Schlüssel erlaubt." ab, auch die der normalen App. Ist dann keine App mehr angemeldet, hilft nur das Convex-Dashboard: in der Tabelle `apiKeys` bei alten Zeilen `revokedAt` auf die aktuelle Unixzeit in Millisekunden setzen.

### Neuer Integrationsschlüssel

Integrationen wie der [Capture-Skill](../skills/task-capture/SKILL.md) bekommen einen eigenen Schlüssel. "Neuer Integrationsschlüssel" öffnet dafür ein zweites Blatt über den Einstellungen:

1. Einen Namen mit 1 bis 80 Zeichen eingeben, etwa `task-capture Claude`, und "Mit Shoo bestätigen" wählen.
2. Der Browser öffnet Shoo. Der Ablauf gleicht der [Anmeldung](#anmelden), nur mit `kind: "integration"`. Das Fenster zeigt "Warte auf die Anmeldung im Browser …". "Abbrechen" beendet das Warten und führt zurück zu Schritt 1, der Name bleibt stehen.
3. Das Blatt zeigt den Schlüssel genau einmal. "Kopieren" legt ihn über den Main-Prozess in die Zwischenablage, denn der Renderer hat keinen Zugriff darauf. "Fertig" schließt das Blatt.
4. In der Liste bleibt vom Schlüssel nur das Präfix. Die neue Zeile trägt "neu", bis die Einstellungen schließen.

Die App speichert den Schlüssel nicht. Er liegt nur im Zustand des Blatts und ist nach dem Schließen weg. Wer ihn nicht kopiert hat, widerruft ihn und erzeugt einen neuen. Die erneute Shoo-Anmeldung sorgt dafür, dass ein gestohlener Geräteschlüssel allein keine dauerhaften Schlüssel erzeugen kann. Kommt der Browser erst nach einem Abbruch zurück, widerruft die App den neuen Schlüssel sofort. Es läuft immer nur eine Shoo-Anmeldung, App-Anmeldung und Schlüsselerstellung teilen sich Sperre und Abbruch.

## Endpunkte der App

Alle Pfade liegen auf der Convex-Site. JSON-Fehler haben die Form `{ "error": { "code", "message" }, "requestId" }` wie in der [HTTP-API](api.md#fehler).

| Methode und Pfad             | Zweck                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /auth/desktop/callback` | Redirect-Ziel für Shoo. Leitet an den Loopback-Listener weiter, ungültiger State ergibt 400                                                                              |
| `POST /auth/desktop-login`   | Body `{ code, codeVerifier, deviceName, kind? }`. `kind` ist `device` (Standard) oder `integration`, `deviceName` wird zum Schlüsselnamen. Liefert `{ key, prefix, id }` |
| `POST /auth/device-token`    | Bearer-Geräteschlüssel oder Schlüssel ohne Typ. Liefert das kurzlebige Convex-JWT. Integrationsschlüssel erhalten 403 `FORBIDDEN`                                        |
| `POST /auth/device-revoke`   | Bearer-Schlüssel jeder Art. Widerruft genau diesen Schlüssel, liefert `{ "revoked": true }`                                                                              |
| `GET /.well-known/jwks.json` | Öffentliche Schlüssel, mit denen Convex die JWTs prüft                                                                                                                   |

Liste und Widerruf in den Einstellungen laufen nicht über HTTP, sondern über die Convex-Funktionen `auth.listApiKeys` und `auth.revokeApiKey`, siehe [Architektur](architecture.md#identität).

## Bedienung

Das Fenster startet mit der gemeinsamen Prioritätsansicht. Die Bereichswahl oben rechts wechselt zwischen Priorität, me, agency, work, Habits, Wiederholungen und Verlauf. In jedem Bereich stehen Tasks und Backlog untereinander. Später geplante Aufgaben liegen in einem aufklappbaren Abschnitt.

| Aktion                                  | Bedienung                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Fenster zeigen oder fokussieren         | `⌘⇧Leertaste`                                                           |
| Bereits fokussiertes Fenster ausblenden | Derselbe globale Kurzbefehl                                             |
| Priorität, me, agency, work, Habits     | `⌘1` bis `⌘5`                                                           |
| Neue Aufgabe fokussieren                | `⌘N`, in Wiederholungen und Verlauf mit Wechsel in den Standardbereich  |
| Aufgabe erfassen                        | Text eingeben und `Enter`                                               |
| Titel bearbeiten                        | Auf den Titel klicken, `Enter` speichert, `Escape` verwirft den Entwurf |
| Fokussierte Aufgabe erledigen           | `⌘Enter` oder Checkbox                                                  |
| Fokussierte Aufgabe umsortieren         | `⌥↑` und `⌥↓`                                                           |
| Fenster ausblenden                      | `Escape` oder `⌘W`                                                      |
| Einstellungen                           | `⌘,`, zwischen den Tabs mit `←` `→`, `Home` und `End`                   |
| Blatt schließen                         | `Escape`, bei zwei Blättern übereinander schließt nur das obere         |

Der globale Kurzbefehl lässt sich unter Einstellungen > Fenster ändern. Belegte oder ungültige Tastenkombinationen werden abgewiesen; der vorherige Kurzbefehl bleibt erhalten. Das Menüleistenmenü öffnet alle sieben Ansichten, schaltet Vordergrund und Schreibtischverhalten um und beendet die App. Das Schließen des Fensters blendet es aus; die Menüleiste bleibt verfügbar. Autostart ist optional und wird ausschließlich auf ausdrückliche Auswahl in der installierten App aktiviert.

Tasks besitzen höchstens eine Ebene von Subtasks. Das Abschließen eines Kindes schließt seinen Parent nicht ab. Erledigte Einträge stehen oben und bleiben bis zum serverseitigen Tageswechsel sichtbar. Die manuelle Reihenfolge ist innerhalb der offenen beziehungsweise erledigten Geschwister veränderbar. Das Entfernen der Inbox-Markierung ändert keine Position.

Die Aufgabendetails enthalten Projekt, Bereich, Aktiv/Backlog, KI, hohe Priorität, Planungstag, verbindlichen Termin und Snooze. Termine sind voneinander getrennt; eine überfällige Aufgabe kann wieder normal eingeordnet werden. Verwerfen erzeugt keinen Erledigungseintrag. Die kompakte Verlaufsansicht zeigt Abschlussmomentaufnahmen einschließlich Parent- und Projektkontext.

### Einstellungen

`⌘,` oder das Reglersymbol in der Titelleiste öffnet die Einstellungen mit drei Tabs:

- **Fenster.** Vordergrund, alle Schreibtische, Autostart, globaler Kurzbefehl und Fensterfarbe. Diese Werte gelten nur für diesen Mac und liegen in `window.json`.
- **Konto.** Standardbereich (me, agency oder work) und Zeitzone. Convex speichert beide, sie gelten für alle Geräte und für die API. Die Zeitzone ist ein Suchfeld über `UTC` und `Intl.supportedValuesOf("timeZone")` und zeigt den aktuellen UTC-Versatz. Umbenannte Städte stehen unter dem heutigen Namen, etwa `Europe/Kyiv` statt `Europe/Kiev`. `↑` `↓` wählen einen Treffer, `Enter` speichert, `Escape` leert die Suche. Darunter steht "Verbindung entfernen".
- **Schlüssel.** Liste, Widerruf und neue Integrationsschlüssel, siehe [Schlüssel](#schlüssel).

Ein Zeitzonenwechsel berechnet Wiederholungen und geplante Aktivierungen in der neuen Zone neu. Bereits gespeicherte Erledigungen behalten ihren Tag und ihre Zone. Solange die App nicht angemeldet ist, also bei Anmeldung, Laden oder "Noch keine Verbindung.", zeigen die Einstellungen nur den Inhalt von Fenster und, falls die App einen Schlüssel gespeichert hat, "Verbindung entfernen". Reißt die Verbindung später ab, bleiben alle drei Tabs. Konto und Widerruf sind dann gesperrt, die Schlüsselliste kann veraltet sein.

### Wiederholungen

Die Ansicht Wiederholungen zeigt die Vorlagen hinter Habits und wiederkehrenden Aufgaben, getrennt in die Abschnitte Habits und Aufgaben. Aufgaben nennen ihre Regel, etwa "täglich", "jeden Montag" oder "monatlich am 31.", dazu Bereich und Projekt. Habits gelten immer täglich und zeigen keine Regel.

- Ein Klick auf den Titel benennt um. `Enter` oder das Verlassen des Felds speichert, `Escape` verwirft. Eine gerade offene Instanz übernimmt den neuen Titel, der Verlauf behält den alten.
- Das Pause-Symbol erscheint, wenn der Mauszeiger über der Zeile steht oder sie den Tastaturfokus hat. Pausierte Einträge sammelt der aufklappbare Abschnitt "Pausiert", dort setzt "Fortsetzen" sie fort.
- Ein pausierter Habit verschwindet aus der heutigen Liste und kommt beim Fortsetzen am selben Tag zurück. Bei Aufgaben bleibt eine schon offene Instanz stehen, nur neue entstehen bis zum Fortsetzen nicht.

Regel, Bereich und Projekt lassen sich hier nicht ändern. Neue Habits entstehen über die Erfassung in der Ansicht Habits. Neue wiederkehrende Aufgaben legt die App nicht an.

## Fenster und Sicherheitsgrenzen

Electron 44.2.0 erstellt auf macOS ein `panel` mit `floating`-Fensterlevel. `setVisibleOnAllWorkspaces` mit `visibleOnFullScreen` hält es auf allen Schreibtischen und über Vollbild-Apps sichtbar. Die installierte App ist mit `LSUIElement` als Menüleisten-App markiert. Sie blendet sich beim Wechsel zur anderen App nicht selbst aus. Der Hintergrund verwendet native Vibrancy; vollständig transparente Browserfenster mit ihren Resize-Einschränkungen werden vermieden.

Nur die Titelleiste ist eine Ziehfläche. Buttons und Eingaben sind davon ausgenommen. Das Fenster lässt sich über seine Ränder vergrößern. Beim Wiederherstellen werden gespeicherte Grenzen gegen die tatsächlich angeschlossenen Displays geprüft. Nach Entfernen eines Displays wird ein betroffenes Fenster auf einen erreichbaren Schreibtisch zurückgeholt.

Der Renderer läuft mit Sandbox, `contextIsolation`, ausgeschalteter Node-Integration und einer Content Security Policy. Fremdnavigation, neue Fenster, Webviews und Browserberechtigungen sind gesperrt. Jede IPC-Anfrage muss aus dem Main-Frame genau dieses Fensters und seiner erlaubten lokalen Datei beziehungsweise Entwicklungsorigin stammen. Die wenigen IPC-Eingaben werden zusätzlich geprüft. Im Entwicklungsmodus ist die React-HMR-Preamble erlaubt; der Produktionsbuild erlaubt keine Inline-Skripte.

Die App speichert keine Aufgaben lokal und bestätigt Änderungen erst nach erfolgreicher Mutation. Während einer erkannten Verbindungsunterbrechung sind Schreibaktionen gesperrt. Ein fehlgeschlagener Abschluss bleibt offen; ein nicht gespeicherter Erfassungsentwurf bleibt im Eingabefeld.

## Verifikation

```bash
vp test run apps/desktop/test
```

Die Tests prüfen die Loopback-Anmeldung mit PKCE, State, Abbruch und Zeitüberschreitung, die Sperre für eine zweite gleichzeitige Shoo-Anmeldung, erlaubte Renderer-Origins und IPC-Argumente samt Schlüsselnamen und Zwischenablagetext, Monitorwechsel, verschlüsselte Speicherung ohne Klartext-Fallback, fehlgeschlagene Erfassung und Abschlüsse, Schreibsperren bei Verbindungsunterbrechung und getrennte Parent-/Subtask-Abschlüsse. Gegen ein nachgebildetes Convex prüfen sie außerdem den Ablauf für neue Integrationsschlüssel mit Abbruch, den Widerruf in der Liste, Standardbereich und Zeitzone sowie Pausieren, Fortsetzen und Umbenennen von Wiederholungen.

Build und Tests ersetzen nicht die Betriebsprüfung mit einer eingerichteten Convex-Umgebung. Auf dem tatsächlichen Mac stehen vor allem die Anmeldung über Shoo, ein Integrationsschlüssel mit echter Shoo-Bestätigung, der Widerruf über "Verbindung entfernen" und über die Schlüsselliste, die Tokenerneuerung, Wechsel zwischen Schreibtischen, Vollbild-Apps und die Fokusübergabe aus. Developer-ID-Signierung, Notarisierung und Verteilung sind noch nicht eingerichtet.

## Dokumentationsgrundlage

- [Shoo](https://shoo.dev): Authorization Code mit PKCE, `client_id` aus der Origin der Redirect-URI.
- [Raycast Notes](https://manual.raycast.com/notes): Ein-Fenster-Bedienung, Checkboxen und Tastaturbefehle.
- [Electron-Fensteroptionen](https://www.electronjs.org/docs/latest/api/structures/base-window-options): Panel, Vibrancy und Fensterverhalten.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): Vordergrund, Schreibtische und Vollbild.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): macOS-Schlüsselbund und verschlüsselte Geheimnisse.
- [Electron-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security): Renderer-Sandbox und IPC-Grenzen.

Glaze wurde erneut geprüft. Seine öffentliche Beta-Dokumentation bestätigt geeignete Fensterfähigkeiten, liefert hier aber keinen installierten, überprüfbaren Projektstarter. Deshalb ist dieser Client als eigenständiges Electron-Paket implementiert. Die gemeinsame Aufgaben-API bleibt auch für einen späteren Glaze-Client nutzbar.
