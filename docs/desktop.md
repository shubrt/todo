# todo für macOS

Die Desktop-App ist der einzige Client. Sie zeigt die Convex-Aufgaben in einem kleinen schwebenden Fenster, das sich wie Raycast ganz mit der Tastatur bedienen lässt. Einen zweiten Markdown-Bestand oder einen Offline-Aufgabenspeicher gibt es nicht.

## Starten und bauen

Voraussetzungen sind der installierte Workspace, Node 24 und macOS auf Apple Silicon. In `.env` im Repository-Root steht `CONVEX_SITE_URL`, die Site-URL des Convex-Deployments, etwa `https://dein-projekt.convex.site`. `scripts/build.mjs` liest die Datei und kompiliert den Wert in den Main-Prozess. Eine gleichnamige Variable aus der Shell hat Vorrang. Nach einer Änderung die App neu bauen. Fehlt der Wert oder ist er ungültig, scheitert die Anmeldung mit einem Hinweis auf `CONVEX_SITE_URL`. Ein neuer Worktree hat keine `.env`. Die Datei aus dem Haupt-Checkout kopieren oder `CONVEX_SITE_URL` in der Shell setzen.

```bash
vp run dev
vp run build
vp run package
```

Die Root-Befehle rufen `dev`, `build` und `package` von `@todo/desktop` auf. Im Verzeichnis `apps/desktop` gehen auch `node scripts/dev.mjs`, `node scripts/build.mjs` und `node scripts/package.mjs`.

`dev` baut Main und Preload, startet einen lokalen Vite-Server und öffnet das Electron-Fenster. Rendereränderungen erscheinen per HMR, Änderungen an Main oder Preload brauchen einen Neustart des Befehls. Jeder Worktree startet als eigene Variante mit dem Branchnamen, etwa `todo login-fix` mit `✓ login-fix` im Tray. Eine Variante hat eigene Daten und damit eine eigene Anmeldung, keinen globalen Kurzbefehl und endet mit dem Dev-Befehl. Jede Anmeldung in einer Variante legt einen eigenen Geräteschlüssel an, der nie abläuft. Das Löschen des Worktrees widerruft ihn nicht. Vorher in der Variante unter Einstellungen "Abmelden" wählen. Einen vergessenen Schlüssel widerruft man in einer anderen angemeldeten App unter Einstellungen > Schlüssel, siehe [Schlüssel](#schlüssel). `TODO_DESKTOP_VARIANT=<name>` überschreibt den Namen und erzeugt bei `package` eine getrennte App neben der normalen.

Der Paketbefehl erstellt:

- `apps/desktop/release/todo-darwin-arm64/todo.app`
- `apps/desktop/release/todo-0.2.0-mac-arm64.zip`

Das Paket wird lokal gebaut und weder installiert noch hochgeladen. Es hat keine Developer-ID-Signatur und keine Apple-Notarisierung. Für eine Verteilung an andere Macs fehlt dieser Schritt mit einem passenden Apple-Zertifikat.

### Auf diesem Mac installieren und aktualisieren

```bash
vp run install:mac
```

Der Befehl installiert den aktuellen Stand von `main` als `/Applications/todo.app`. Er läuft aus jedem Checkout des Repositorys, braucht dort aber eine `.env` mit `CONVEX_SITE_URL`. Die Schritte:

1. Er holt `origin/main` und legt dafür einen temporären Worktree an. Die eigenen Checkouts bleiben unberührt.
2. Er führt dort `vp install`, `vp run qa` und `vp run package` aus.
3. Erst wenn alles geklappt hat, beendet er ein laufendes todo, ersetzt die App und startet die neue Version. Scheitert ein Schritt davor, bleibt die installierte App unverändert. Läuft die neue Version fünf Sekunden nach dem Start nicht, kommt die bisherige zurück.

Zwei Läufe gleichzeitig verhindert eine Sperre. Automatische Updates gibt es nicht. Nach jedem Merge nach `main` reicht ein erneuter Aufruf.

Die App bekommt keine eigene Signatur. Ihr Hauptprogramm ist die unveränderte, ad hoc signierte Electron-Binärdatei. macOS erkennt Apps ohne Apple-Zertifikat für den Schlüsselbund an deren Hash, und der ändert sich nur mit der Electron-Version. Nach einem Update fragt der Schlüsselbund deshalb nicht erneut nach dem Zugriff auf "todo Safe Storage", erst nach einem Wechsel der Electron-Version einmal. Ein selbst signiertes Zertifikat würde daran nichts verbessern, weil jede neue Signatur einen neuen Hash ergibt. Eine selbst gebaute App trägt keine Download-Markierung, Gatekeeper prüft sie deshalb nicht.

## Anmelden

Ohne gespeicherte Verbindung zeigt das Fenster nur die Anmeldung, ohne Seitenleiste. `↵` wählt "Mit Shoo anmelden". Der Ablauf:

1. Der Main-Prozess öffnet einen HTTP-Listener auf `127.0.0.1` mit zufälligem Port. Er erzeugt einen PKCE-Verifier aus 48 Zufallsbytes und einen State der Form `<port>.<zufall>`.
2. Der Standardbrowser öffnet `https://shoo.dev/authorize` mit `client_id=origin:<site>`, `redirect_uri=<site>/auth/desktop/callback` und der S256-Challenge.
3. Nach der Anmeldung leitet Shoo auf `GET /auth/desktop/callback` der Convex-Site. Der Endpunkt prüft das Format des State und leitet mit HTTP 302 an `http://127.0.0.1:<port>/callback` weiter. Dabei reicht er nur `code`, `state` und `error` durch.
4. Die App vergleicht den State und schickt Code, Verifier und einen Gerätenamen wie `todo auf <Rechnername>` an `POST /auth/desktop-login`.
5. Convex tauscht den Code bei Shoo ein, prüft ID-Token und Besitzerzuordnung und legt einen Geräteschlüssel mit diesem Namen an.
6. Die App speichert Site-URL und Schlüssel verschlüsselt und verbindet sich.

Während das Fenster "Warte auf den Browser …" zeigt, bricht `esc` die Anmeldung ab. Kommt der Browser nicht innerhalb von zehn Minuten zurück, bricht sie selbst ab. Wer erst nach der Rückkehr aus dem Browser abbricht, wartet den laufenden Codetausch ab. Die App speichert den neuen Schlüssel dann nicht und widerruft ihn. Eine erneute Anmeldung ersetzt den gespeicherten Schlüssel und widerruft den alten.

Der Umweg über Convex hält die Shoo-Identität stabil. Shoo vergibt das `sub` pro Origin der Redirect-URI. `todo://` hat keine verwendbare Origin, und ein zufälliger Loopback-Port würde das `sub` bei jeder Anmeldung ändern. Der Verifier bleibt bis zum Codetausch auf dem Mac, ein abgefangener Code ist ohne ihn wertlos.

Bei der ersten Anmeldung kennt das Backend das `sub` noch nicht und antwortet mit HTTP 403. Die Fehlermeldung enthält genau den Eintrag für `SHOO_OWNER_SUBJECTS`, etwa `{"https://dein-projekt.convex.site":"ps_…"}`. Nach dem Eintragen in der Convex-Umgebung erneut anmelden, ein Deploy ist nicht nötig. Die Schritte stehen in [Entwicklung](development.md#erstes-backend-deployment).

## Verbindung und Speicherung

Die App legt den Zugang als `{ siteUrl, apiKey }` in `connection.enc` unter dem Electron-Nutzerverzeichnis ab, auf macOS normalerweise `~/Library/Application Support/todo/`. Varianten verwenden `~/Library/Application Support/todo-<variante>/`. Electron `safeStorage` verschlüsselt die Datei mit dem macOS-Schlüsselbund. Ist der Schlüsselbund nicht verfügbar, speichert die App nichts, auch keinen Klartext. Über die Preload-Schnittstelle bekommt der Renderer den Verbindungsstatus, die App-Version, die öffentliche Site-URL, Fenstereinstellungen, kurzlebige JWTs und einmalig jeden neu erzeugten Integrationsschlüssel. Außerdem kann er die Emoji-Auswahl von macOS öffnen. Den Geräteschlüssel bekommt er nie.

Für Live-Daten tauscht der Main-Prozess den Schlüssel gegen ein JWT:

```http
POST /auth/device-token
Authorization: Bearer todo_<geräteschlüssel>
```

Die Antwort `{ "token": "<JWT>", "expiresAt": 1788600300000 }` hat keine `data`-Hülle. `expiresAt` ist eine UTC-Unixzeit in Millisekunden. Das ES256-JWT gilt höchstens fünf Minuten. `sub` ist der Owner, `apiKeyId` der Geräteschlüssel, die Audience `todo`. `createTokenProvider` aus `@todo/native-client` hält das JWT nur im Arbeitsspeicher, erneuert es bei weniger als 30 Sekunden Restlaufzeit und bündelt gleichzeitige Abrufe. Bei HTTP 401 liefert er `null`. Die App zeigt dann wieder die Anmeldung, darunter in Rot "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Melde dich erneut an." Netzwerk- und Serverfehler werfen `NativeApiError` und löschen keinen gespeicherten Schlüssel. Das Fenster zeigt dann "Deine Aufgaben sind gerade nicht erreichbar." mit "Erneut verbinden" (`↵`) und "Neu anmelden". Gelingt die Verbindung, aber das Backend kann die Listen nicht einrichten (`lists.bootstrap`), zeigt das Fenster "Deine Listen konnten nicht geladen werden." oder die Meldung des Backends, dazu "Erneut versuchen" (`↵`). Nach der nächsten neuen Verbindung versucht die App es auch von selbst.

"Abmelden" in den Einstellungen widerruft den Schlüssel per `POST /auth/device-revoke` und löscht danach `connection.enc`. Der Widerruf ist ein Versuch ohne Garantie. Scheitert er, etwa ohne Netz, bleibt der Schlüssel im Backend aktiv und zählt weiter zur Grenze von 30 aktiven Schlüsseln. Aufgaben im Backend bleiben in jedem Fall unverändert.

Geräteschlüssel laufen nicht ab. Ein Schlüssel bleibt aktiv, bis "Abmelden", eine erneute Anmeldung in derselben App oder ein Widerruf unter Einstellungen > Schlüssel ihn beendet. Liegengebliebene Schlüssel stammen vor allem von Varianten gelöschter Worktrees, seltener von gescheiterten Widerrufen. Ihr Name nennt App und Rechner, etwa `todo login-fix auf <Rechnername>`.

Fensterposition, Größe, Vordergrund, Schreibtischverhalten, Kurzbefehl und Autostartpräferenz liegen getrennt davon in `window.json`. Diese Datei enthält weder Aufgaben noch Zugangsdaten. Eine ältere Datei mit der entfernten Fensterfarbe `tint` behält ihre übrigen Werte, beim nächsten Speichern fällt `tint` weg.

## Schlüssel

Das Backend kennt drei Arten von Schlüsseln:

| Art         | `kind`        | Entsteht                                      | Gilt für                                     |
| ----------- | ------------- | --------------------------------------------- | -------------------------------------------- |
| Gerät       | `device`      | Bei der Anmeldung einer App oder Variante     | `/auth/device-token` und `/api/v1`           |
| Integration | `integration` | Über "Neuer Integrationsschlüssel"            | Nur `/api/v1`, `/auth/device-token` gibt 403 |
| Ohne Typ    | fehlt         | Vor Einführung der Arten, etwa in der Web-App | Wie Geräteschlüssel                          |

Einstellungen > Schlüssel listet alle aktiven Schlüssel aller Arten außer dem eigenen, jeweils mit Name und Erstelldatum wie `seit 2. Okt.`. Den Namen des eigenen Schlüssels zeigt Info > Dieser Mac. Er endet nur mit "Abmelden". Steht die Auswahl auf einem anderen Schlüssel, zeigt die Zeile `⌘⌫`, und `⌘⌫` widerruft ihn sofort und ohne Rückfrage. Convex liest die Schlüsselzeile bei jedem Zugriff, eine widerrufene App verliert deshalb auch ihre laufenden Abonnements.

Höchstens 30 Schlüssel aller Arten dürfen gleichzeitig aktiv sein. Widerrufene und abgelaufene zählen nicht mit. Ablaufen können nur alte Schlüssel ohne Typ, abgelaufene stehen auch nicht in der Liste. Info > Schlüssel aktiv zeigt etwa `3 von 30`. Bei 30 ist "Neuer Integrationsschlüssel" gesperrt, und das Backend lehnt jede weitere Anmeldung mit "Es sind höchstens 30 aktive Schlüssel erlaubt." ab, auch die der normalen App. Ist dann keine App mehr angemeldet, hilft nur das Convex-Dashboard: in der Tabelle `apiKeys` bei alten Zeilen `revokedAt` auf die aktuelle Unixzeit in Millisekunden setzen.

### Neuer Integrationsschlüssel

Integrationen wie der [Capture-Skill](../skills/task-capture/SKILL.md) bekommen einen eigenen Schlüssel. "Neuer Integrationsschlüssel" öffnet dafür ein eigenes Panel über den Einstellungen:

1. Einen Namen mit 1 bis 80 Zeichen eingeben, etwa `task-capture Claude`, und mit `↵` "Mit Shoo bestätigen" wählen.
2. Der Browser öffnet Shoo. Der Ablauf gleicht der [Anmeldung](#anmelden), nur mit `kind: "integration"`. Das Panel zeigt "Warte auf den Browser …". "Abbrechen" oder `esc` beendet die Anmeldung und führt zurück zu den Einstellungen.
3. Das Panel zeigt den Schlüssel genau einmal. "Kopieren" (`⌘C`) legt ihn über den Main-Prozess in die Zwischenablage, denn der Renderer hat keinen Zugriff darauf. "Fertig" oder `esc` schließt das Panel.
4. In der Schlüsselliste steht danach nur noch der Name.

Die App speichert den Schlüssel nicht. Er liegt nur im Zustand des Panels und ist nach dem Schließen weg. Wer ihn nicht kopiert hat, widerruft ihn und erzeugt einen neuen. Die erneute Shoo-Anmeldung sorgt dafür, dass ein gestohlener Geräteschlüssel allein keine dauerhaften Schlüssel erzeugen kann. Kommt der Browser erst nach einem Abbruch zurück, widerruft die App den neuen Schlüssel sofort. Es läuft immer nur eine Shoo-Anmeldung, App-Anmeldung und Schlüsselerstellung teilen sich Sperre und Abbruch.

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

Das Fenster besteht aus Titelleiste, Seitenleiste und der geöffneten Liste. Einen Kopf- oder Fußbereich im Inhalt gibt es nicht. Der Hintergrund ist schwarz, der Text weiß. Eine Fensterfarbe gibt es nicht mehr, stattdessen färbt jede Liste ihre Checkboxen, Habit-Punkte und Wiederholungssymbole.

Die Titelleiste ist 40 Pixel hoch und dient als Ziehfläche. Links sitzen die Ampelknöpfe von macOS. Nur Schließen ist aktiv und blendet das Fenster aus, Minimieren und Zoomen sind grau. In der Mitte stehen Emoji und Name der geöffneten Liste, bei einer Variante dahinter ihr Name. Rechts zeigt ein Punkt den Stand der Synchronisierung, beim Überfahren mit Text:

| Punkt | Text               | Bedeutung                                                                                                       |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| Grün  | Synchronisiert     | Verbunden, keine Änderung unterwegs                                                                             |
| Gelb  | Wird gespeichert … | Eine Änderung ist länger als eine Sekunde unterwegs, oder die Verbindung ist seit weniger als drei Sekunden weg |
| Rot   | Offline            | Die Verbindung fehlt seit mindestens drei Sekunden, oder die Anmeldung gilt nicht mehr                          |

Schreiben ist gesperrt, sobald die Verbindung fehlt. Das gilt schon in den ersten drei Sekunden, in denen der Punkt noch gelb ist.

Die Seitenleiste zeigt die Favoriten als Emoji, Listen ohne Emoji als Anfangsbuchstaben in einem kleinen Feld. Beim Überfahren erscheinen Name und Kurzbefehl `⌘1` bis `⌘9`. Ist eine Liste geöffnet, die kein Favorit ist, steht sie unter einem kurzen Strich, bis eine andere Liste gewählt wird. Unten öffnet das Reglersymbol die Einstellungen. Anfangs sind Wichtig, me, agency, work und Habits Favoriten, in dieser Reihenfolge. In der Listensuche verschieben `⌥↑` und `⌥↓` den markierten Favoriten um eine Stelle. Seitenleiste und `⌘1` bis `⌘9` folgen der neuen Reihenfolge.

Das Menüleistenmenü öffnet Wichtig, Verlauf, Wiederholungen und mit "Listen …" die Listensuche. Darunter schalten "Immer im Vordergrund" und "Auf allen Schreibtischen" um. Es folgen "Einstellungen …" (`⌘,`), "Fenster ausblenden" und "Beenden" (`⌘Q`). Einen Pin in der Titelleiste gibt es nicht, "Immer im Vordergrund" steht im Menü und in den Einstellungen. Das Schließen des Fensters blendet es nur aus, die Menüleiste bleibt verfügbar. Autostart ist optional und lässt sich nur in der installierten App einschalten.

### Listen

Eine normale Liste hat die Abschnitte Tasks, Backlog und Für später. Tasks ist anfangs offen, Backlog und Für später sind zugeklappt. Für später erscheint nur, solange eine Aufgabe der Liste für einen späteren Tag eingeplant oder zurückgestellt ist. Jeder Abschnittskopf zeigt die Zahl der offenen Hauptaufgaben. Ein Klick auf den Kopf oder `→` und `←` auf dem ausgewählten Kopf klappen ihn auf und zu. Welche Abschnitte offen sind, merkt sich die App je Liste auf diesem Mac. In Tasks stehen oben die heute erledigten Aufgaben, darunter die offenen in manueller Reihenfolge. Ist nichts offen, steht dort "Nichts offen. ⌘N legt eine Aufgabe an."

Die festen Listen zeigen Einträge aus allen Listen:

- Wichtig hat je Herkunftsliste einen Abschnitt mit Emoji, Name und Zahl der offenen Aufgaben, zuerst in der Reihenfolge der Seitenleiste, danach die übrigen Listen. Darin stehen offene Hauptaufgaben mit hoher Priorität oder einer Frist bis heute und die heute erledigten davon. Die Checkboxen tragen die Farbe der Herkunftsliste. Umsortieren geht hier nicht.
- Habits hat einen Abschnitt Heute mit erledigt und gesamt, etwa `2/5`. Neben jedem Habit zeigen sechs Punkte die sechs Vortage, gefüllt in der Listenfarbe, wenn der Habit an diesem Tag erledigt wurde. `⌘N` legt hier einen neuen täglichen Habit an. Die Reihenfolge aus `⌥↑` und `⌥↓` gilt auch für die folgenden Tage.
- Verlauf zeigt Erledigungen nach lokalem Tag, also Heute, Gestern und danach etwa `Di., 6. Okt.`, jeweils mit Anzahl. Statt einer Checkbox steht die Uhrzeit vorn. Subtasks tragen den Titel ihres Parents davor. Rechts steht das aktuelle Emoji der Liste, ohne Emoji ihr Anfangsbuchstabe, beim Überfahren ihr Name. Bei einer gelöschten Liste gelten Name und Emoji vom Zeitpunkt der Erledigung. "Weitere laden" holt ältere Tage, auch von selbst, sobald die Zeile ins Bild scrollt.
- Wiederholungen beschreibt der Abschnitt [Wiederholungen](#wiederholungen).

`⌘P` öffnet die Listensuche. Solange keine Liste genau so heißt, steht unter den Treffern "<Name> als neue Liste anlegen". Darauf legt `↵` die Liste mit der nächsten Farbe der Palette an und öffnet sie. `⌘K` auf der markierten Liste öffnet ihre Aktionen. Deren Kürzel wirken auch ohne `⌘K` direkt in der Listensuche auf die markierte Liste:

| Aktion                    | Taste         | Wirkung                                                                                                      |
| ------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| Als Favorit, Kein Favorit | `⇧⌘P`         | Nimmt die Liste in die Seitenleiste auf oder heraus                                                          |
| Umbenennen                | `⌘R`          | Das Suchfeld enthält den Namen, `↵` speichert                                                                |
| Emoji wählen              | `⌃⌘Leertaste` | Öffnet die Emoji-Auswahl von macOS und speichert das erste gewählte Emoji. "Emoji entfernen" (`⌫`) löscht es |
| Farbe ändern …            | `⇧⌘C`         | Zehn Farben zur Auswahl                                                                                      |
| Nach oben, Nach unten     | `⌥↑` `⌥↓`     | Nur bei Favoriten. Verschiebt die Liste in der Seitenleiste um eine Stelle                                   |
| Liste löschen             | `⌘⌫`          | Ohne Rückfrage, aber nur für leere Listen und nicht für die Standardliste                                    |

`⇧⌘P`, `⌥↑` und `⌥↓` lassen die Listensuche offen, damit die Änderung zu sehen ist. Die übrigen Aktionen schließen sie oder öffnen ihr eigenes Panel.

Eine Liste ist leer, wenn keine aktuelle Aufgabe und keine Wiederholung mehr zu ihr gehört, auch keine pausierte. Heute erledigte Aufgaben zählen bis zum nächtlichen Aufräumen mit. Bei einer nicht leeren Liste zeigt die App den Fehler des Backends, etwa "Die Liste ist nicht leer." Hängt nur noch eine Wiederholung an der Liste, nennt der Fehler ihren Titel. Wer sie unter [Wiederholungen](#wiederholungen) löscht, kann danach die Liste löschen. Wichtig, Habits, Verlauf und Wiederholungen bieten nur Als Favorit beziehungsweise Kein Favorit an, als Favorit dazu Nach oben und Nach unten.

### Aufgaben

Jede Aufgabe ist eine Zeile mit Checkbox in der Listenfarbe und Titel. Rechts folgen die Details in fester Reihenfolge:

1. ⚡️ für eine KI-Aufgabe
2. Erledigte und alle Subtasks, etwa `1/3`, mit Pfeil
3. ↻ für die Instanz einer Wiederholung
4. Fahne mit Frist, orange am Fälligkeitstag, rot danach
5. Kalender mit Planungstag
6. Uhr mit Snooze-Zeitpunkt, etwa `Di., 9:00`
7. ‼️ für hohe Priorität

Tage stehen relativ da: heute, morgen und innerhalb der nächsten sechs Tage der Wochentag wie `Mo.`, bei überfälligen Fristen auch gestern oder ein vergangener Wochentag, sonst ein Datum wie `16. Okt.`. Erledigte Zeilen sind durchgestrichen und zeigen keine Details.

Beim Öffnen einer Liste ist die oberste Aufgabe markiert, in einer leeren Liste der Abschnitt Tasks. Die Pfeiltasten arbeiten also sofort.

Ein blauer Punkt am linken Rand markiert eine Aufgabe aus der Inbox, also eine über die API erfasste. Sobald die Zeile mit Tastatur oder Maus ausgewählt wird, entfernt die App die Markierung im Backend. Die automatische Markierung beim Öffnen einer Liste zählt dabei nicht. Die Position bleibt dabei gleich. Ohne Verbindung bleibt der Punkt, bis die Zeile wieder ausgewählt wird.

Subtasks stehen eingerückt unter ihrer Aufgabe, eine Ebene tief. Sie bleiben zugeklappt, bis `→` oder ein Klick auf die Subtask-Zahl sie zeigt. Eine erledigte Subtask erledigt den Parent nicht, und ein erledigter Parent darf offene Subtasks haben.

Ein Klick wählt eine Zeile aus, ein Doppelklick bearbeitet den Titel, ein Rechtsklick öffnet die Aktionen. Ein Klick auf die Checkbox erledigt die Aufgabe oder öffnet sie wieder. `↵` macht den Titel zum Eingabefeld. Darin speichert `↵`, `esc` verwirft und `⌘↵` speichert und erledigt. Auch ein Klick außerhalb des Felds speichert. Scheitert das Speichern, bleibt der Entwurf im Feld.

`⌘N` öffnet eine leere Zeile unter den heute erledigten Aufgaben in Tasks und klappt Tasks dafür auf. In Wichtig, Verlauf und Wiederholungen wechselt `⌘N` vorher in die Standardliste. In der App angelegte Aufgaben bekommen keine Inbox-Markierung.

`⌘↵` auf einer heute erledigten Aufgabe öffnet sie wieder und löscht ihren Eintrag im Verlauf. Nach dem nächtlichen Aufräumen ist sie archiviert, dann lehnt das Backend das ab.

`⇥` macht die ausgewählte offene Hauptaufgabe zur letzten Subtask der nächsten offenen Hauptaufgabe darüber im selben Abschnitt. Planungstag, Frist, Snooze und hohe Priorität fallen dabei weg. Aufgaben mit eigenen Subtasks, Habits und wiederkehrende Aufgaben lassen sich nicht einrücken. `⇧⇥` macht eine Subtask wieder zur Hauptaufgabe, direkt hinter ihrem bisherigen Parent.

Wichtig zeigt von jeder Liste nur einen Teil, die Nachbarn einer Aufgabe stehen dort oft nicht im Bild. Deshalb gehen in Wichtig weder `⇥` und `⇧⇥` noch `⌥↑` und `⌥↓`, und `⌘K` bietet dort Einrücken, Ausrücken, Nach oben und Nach unten nicht an.

Subtasks bekommen nur die Aktionen, die zu ihnen passen, also keine Wichtig-Markierung, keine Termine, kein Verschieben und keinen Backlog. Habits lassen sich nur erledigen, umbenennen, sortieren und verwerfen.

### Tastatur

Der globale Kurzbefehl und die Navigation:

| Taste                 | Wirkung                                                                                |
| --------------------- | -------------------------------------------------------------------------------------- |
| `⇧⌘Leertaste`         | Fenster zeigen oder fokussieren, ein fokussiertes Fenster ausblenden. Global, änderbar |
| `⌘1` bis `⌘9`         | Favorit an dieser Stelle öffnen                                                        |
| `⌘P`                  | Listen suchen, öffnen und anlegen                                                      |
| `⌘K` oder Rechtsklick | Aktionen der ausgewählten Aufgabe                                                      |
| `⌘,`                  | Einstellungen                                                                          |
| `esc`                 | Bearbeitung abbrechen, sonst das oberste Panel schließen, sonst das Fenster ausblenden |
| `⌘W`                  | Fenster ausblenden                                                                     |

In der Liste:

| Taste     | Wirkung                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `↑` `↓`   | Auswahl durch Aufgaben, sichtbare Subtasks und Abschnittsköpfe                                       |
| `→` `←`   | Subtasks der Aufgabe oder den Abschnitt auf- und zuklappen. Auf einer Subtask springt `←` zum Parent |
| `↵`       | Titel bearbeiten, auf einem Abschnittskopf auf- oder zuklappen                                       |
| `⌘N`      | Neue Aufgabe, in Habits ein neuer Habit                                                              |
| `⇧⌘N`     | Neue Subtask der ausgewählten Aufgabe, bei einer Subtask unter demselben Parent                      |
| `⌘↵`      | Erledigen, eine heute erledigte Aufgabe wieder öffnen                                                |
| `⇥`       | Einrücken, also zur Subtask der Aufgabe darüber machen, nicht in Wichtig                             |
| `⇧⇥`      | Ausrücken, also die Subtask wieder zur Hauptaufgabe machen, nicht in Wichtig                         |
| `⌥↑` `⌥↓` | Unter den Geschwistern nach oben oder unten, nicht in Wichtig                                        |

Aktionen für die ausgewählte Aufgabe, mit und ohne `⌘K`:

| Taste | Wirkung                                         |
| ----- | ----------------------------------------------- |
| `⌘I`  | Wichtig an oder aus                             |
| `⇧⌘K` | KI-Aufgabe an oder aus                          |
| `⌘E`  | Einplanen …                                     |
| `⇧⌘E` | Fällig am …                                     |
| `⌘L`  | Zurückstellen …                                 |
| `⇧⌘M` | Verschieben …                                   |
| `⌘B`  | Zwischen Tasks und Backlog wechseln             |
| `⇧⌘I` | Normal einordnen, nur bei überfälligen Aufgaben |
| `⌘⌫`  | Verwerfen, ohne Rückfrage                       |

In der Listensuche öffnet `⌘K` die Aktionen der markierten Liste. `⇧⌘P`, `⌘R`, `⌃⌘Leertaste`, `⇧⌘C`, `⌥↑`, `⌥↓` und `⌘⌫` wirken dort direkt auf die markierte Liste, ebenso im Panel der Listenaktionen. Die Tabelle unter [Listen](#listen) beschreibt sie.

### Panels

Alle Panels folgen Raycast. Oben steht ein Suchfeld, darunter Zeilen mit Symbol, Bezeichnung und rechts einem Wert oder Tastenkürzel. Tippen filtert, `↑` `↓` markieren, `↵` führt aus, `esc` schließt nur das oberste Panel. Steht Text im Suchfeld, leert `⌘⌫` zuerst nur das Feld, die markierte Zeile bleibt. Erst das nächste `⌘⌫` löscht, verwirft oder widerruft. Ein Klick außerhalb schließt alle. Öffnet eine Zeile ein weiteres Panel, etwa Einplanen aus den Aktionen, führt `esc` dorthin zurück.

Die Aktionen (`⌘K`) stehen in drei Gruppen. Zuerst Wichtig, KI-Aufgabe, Einplanen …, Fällig am …, Zurückstellen …, Verschieben … und In den Backlog beziehungsweise Nach Tasks, bei überfälligen Aufgaben zusätzlich Normal einordnen. Dann Erledigen beziehungsweise Wieder öffnen, Titel bearbeiten, Unteraufgabe, Einrücken oder bei Subtasks Ausrücken sowie Nach oben und Nach unten. Zuletzt steht Verwerfen in Rot. Jede Zeile zeigt ihr Tastenkürzel. In Wichtig fehlen Einrücken, Ausrücken, Nach oben und Nach unten.

Einplanen, Fällig am und Zurückstellen öffnen das Datumspanel. Ohne Eingabe bietet es Heute, Morgen, Am Wochenende (nächster Samstag), Nächste Woche (nächster Montag) und In zwei Wochen an, jeweils mit dem Datum rechts. Darunter entfernt "Kein Datum" (`⌫`) den Wert. Eine getippte Angabe erscheint als erste Zeile mit dem Abstand zu heute, etwa `in 4 Tagen`. Das Panel versteht `heute`, `morgen`, `übermorgen`, `15.10.`, `15.10.2026`, `2026-10-15`, Wochentage wie `mo` oder `freitag`, `in 3 tagen`, `in 2 wochen`, `nächste woche`, `nächsten monat` und `wochenende`. Ein Datum ohne Jahr meint den nächsten solchen Tag. Beim Zurückstellen tragen die Vorschläge eine Uhrzeit, heute 18:00, solange das noch bevorsteht, an allen anderen Tagen 9:00. Getippt geht auch eine eigene Zeit wie `morgen 14` oder `fr 9:30`. Eine vergangene Uhrzeit erscheint grau mit `vorbei`. Alle Tage gelten in der Zeitzone des Kontos.

Verschieben (`⇧⌘M`) listet nur normale Listen, zuerst die Favoriten, nach einem Strich die übrigen alphabetisch. Die aktuelle Liste ist grau und trägt `aktuell`. Die Aufgabe landet oben in Tasks der Zielliste, unter den heute erledigten, und nimmt ihre Subtasks mit.

Die Listensuche (`⌘P`) zeigt zuerst die Favoriten, nach einem Strich alle übrigen Listen alphabetisch, auch Verlauf und Wiederholungen. Rechts steht die Zahl der offenen Aufgaben, bei der geöffneten Liste zusätzlich `aktuell`. Die markierte Zeile zeigt einen Stern, ein Klick darauf schaltet den Favoriten um wie `⇧⌘P`. Listen anlegen und die Listenaktionen beschreibt [Listen](#listen).

### Einstellungen

`⌘,` oder das Reglersymbol unten in der Seitenleiste öffnet die Einstellungen als Panel. Das Suchfeld filtert die Zeilen.

- **Fenster.** Immer im Vordergrund, Auf allen Schreibtischen und Beim Anmelden starten, jeweils An oder Aus, dazu der globale Kurzbefehl. `↵` auf Kurzbefehl nimmt die nächste Tastenkombination mit `⌘`, `⌃` oder `⌥` auf, `⇧` allein reicht nicht. `esc` bricht ab. Belegte oder ungültige Kombinationen weist die App ab, der vorherige Kurzbefehl bleibt. Diese Werte gelten nur für diesen Mac und liegen in `window.json`.
- **Konto.** Standardliste und Zeitzone. Convex speichert beide, sie gelten für alle Geräte und für die API. Standardliste öffnet eine Auswahl der normalen Listen. Zeitzone öffnet eine Suche über `UTC` und `Intl.supportedValuesOf("timeZone")` mit dem heutigen UTC-Versatz. Umbenannte Städte stehen unter dem heutigen Namen, etwa `Europe/Kyiv` statt `Europe/Kiev`. Ohne Suchtext stehen dort die gespeicherte Zone und die dieses Macs.
- **Schlüssel.** Neuer Integrationsschlüssel und die übrigen aktiven Schlüssel mit Widerruf, siehe [Schlüssel](#schlüssel).
- **Info.** Nur zum Lesen: Version der App, Server mit dem Host der Site-URL, Dieser Mac mit dem Namen des Geräteschlüssels und Schlüssel aktiv, etwa `3 von 30`.
- **Abmelden.** Rot, als eigener Abschnitt zuletzt. Widerruft den Geräteschlüssel ohne Rückfrage und vergisst die Verbindung, siehe [Verbindung und Speicherung](#verbindung-und-speicherung).

Ist der globale Kurzbefehl schon beim Start belegt, steht der Hinweis in Rot unter dem Panel. Lehnt die App eine neu aufgenommene Kombination ab, erscheint der Fehler wie jeder andere unten im Fenster. Ein Zeitzonenwechsel berechnet Wiederholungen und geplante Aktivierungen in der neuen Zone neu. Bereits gespeicherte Erledigungen behalten ihren Tag und ihre Zone.

Vor der Anmeldung, beim Laden und ohne erreichbares Backend zeigen die Einstellungen nur Fenster, Info und, falls die App einen Schlüssel gespeichert hat, Abmelden. Reißt die Verbindung bei angemeldeter App ab, bleiben alle Abschnitte stehen, Änderungen an Konto und Schlüsseln sind dann aber gesperrt.

### Wiederholungen

Die Liste Wiederholungen zeigt die Vorlagen hinter Habits und wiederkehrenden Aufgaben, je Liste ein Abschnitt mit Name und Anzahl, ohne Emoji. Jede Zeile beginnt mit ↻ in der Listenfarbe. Rechts steht die Regel, etwa `jeden Fr.` oder `monatlich am 1.`. Bei Habits fehlt `täglich`, weil es immer gilt.

- `↵` oder ein Doppelklick benennt um. `↵` speichert, `esc` verwirft. Die offene oder heute erledigte Instanz übernimmt den neuen Titel, der Verlauf behält den alten. Umgekehrt ändert das Umbenennen eines Habits oder einer wiederkehrenden Aufgabe in ihrer Liste auch die Vorlage.
- `⌘K` oder ein Rechtsklick bietet Pausieren beziehungsweise Fortsetzen, Umbenennen und zuletzt in Rot Löschen (`⌘⌫`). Pausierte Einträge bleiben an ihrem Platz, abgeblendet und mit `pausiert`.
- Ein pausierter Habit verschwindet aus Heute und kommt beim Fortsetzen am selben Tag zurück. Bei Aufgaben bleibt eine schon offene Instanz stehen, nur neue entstehen bis zum Fortsetzen nicht.
- Löschen entfernt die Vorlage ohne Rückfrage, auch eine pausierte. Ihre offene Instanz wird verworfen, ohne Eintrag im Verlauf. Frühere Erledigungen bleiben im Verlauf, eine heute schon erledigte Instanz bis zum nächtlichen Aufräumen auch in ihrer Liste. Ohne die Vorlage lässt sich die Liste löschen, sobald sie sonst leer ist.

Regel und Liste lassen sich hier nicht ändern. Neue Habits entstehen mit `⌘N` in der Liste Habits. Neue wiederkehrende Aufgaben legt die App nicht an.

## Fenster und Sicherheitsgrenzen

Electron 44.2.0 erstellt auf macOS ein `panel`. "Immer im Vordergrund" hebt es auf das Fensterlevel `floating`. "Auf allen Schreibtischen" setzt `setVisibleOnAllWorkspaces` mit `visibleOnFullScreen`, dann bleibt es auf allen Schreibtischen und über Vollbild-Apps sichtbar. Die installierte App ist mit `LSUIElement` als Menüleisten-App markiert. Sie blendet sich beim Wechsel zur anderen App nicht selbst aus.

Das Fenster nutzt `titleBarStyle: "hidden"`. macOS zeichnet nur die Ampelknöpfe bei `{ x: 14, y: 13 }`, die Titelleiste darum zeichnet der Renderer. Minimieren, Zoomen und Vollbild sind abgeschaltet, denn ohne Dock-Symbol wäre ein minimiertes Fenster nicht mehr zu finden. Der Hintergrund ist `#000000` ohne Vibrancy. `nativeTheme.themeSource` steht auf `dark`, damit Ampelknöpfe und Menüs dazu passen. Das Fenster ist anfangs 410 × 600 Pixel groß, mindestens 340 × 360 und höchstens 900 breit.

Nur die Titelleiste ist eine Ziehfläche, der Statuspunkt ist davon ausgenommen. Das Fenster lässt sich über seine Ränder vergrößern. Beim Start prüft die App gespeicherte Grenzen gegen die angeschlossenen Displays. Ein Fenster auf einem entfernten Display holt sie auf einen erreichbaren Schreibtisch zurück.

Der Renderer läuft mit Sandbox, `contextIsolation`, ausgeschalteter Node-Integration und einer Content Security Policy. Fremdnavigation, neue Fenster, Webviews und Browserberechtigungen sind gesperrt. Jede IPC-Anfrage muss aus dem Main-Frame genau dieses Fensters und seiner erlaubten lokalen Datei beziehungsweise Entwicklungsorigin stammen. Die wenigen IPC-Eingaben werden zusätzlich geprüft. Im Entwicklungsmodus ist die React-HMR-Preamble erlaubt; der Produktionsbuild erlaubt keine Inline-Skripte.

Die App speichert keine Aufgaben lokal und zeigt Änderungen erst nach erfolgreicher Mutation. Solange die Verbindung fehlt, sind Schreibaktionen gesperrt, ein Versuch meldet "Keine Verbindung. Warte kurz, bis sie wieder steht." Ein fehlgeschlagener Abschluss bleibt offen, ein nicht gespeicherter Titel bleibt im Eingabefeld. Fehler erscheinen sechs Sekunden lang unten in der Mitte, Erfolgsmeldungen gibt es nicht. Bis Daten da sind, bleibt die Liste leer. Ladeanimationen gibt es nicht.

## Verifikation

```bash
vp test run apps/desktop/test
```

Die Tests prüfen die Loopback-Anmeldung mit PKCE, State, Abbruch und Zeitüberschreitung, die Sperre für eine zweite gleichzeitige Shoo-Anmeldung, erlaubte Renderer-Origins und IPC-Argumente samt Schlüsselnamen und Zwischenablagetext, das Laden einer alten `window.json` mit Fensterfarbe, Monitorwechsel, verschlüsselte Speicherung ohne Klartext-Fallback und das Aufräumen beim Wechsel des Convex-Clients. `dates.test.ts` prüft die Datumstexte der Zeilen und das Datumspanel mit getippten Tagen und Uhrzeiten, Vorschlägen und Zurückstellen über die Zeitumstellung hinweg. `ui.test.tsx` bedient das ganze Fenster gegen ein nachgebildetes Convex: Anmeldung, Statuspunkt und Schreibsperre, Seitenleiste und Listensuche, Tastatur und Panels, Einstellungen mit Schlüsseln und alle Arten von Listen.

Build und Tests ersetzen nicht die Prüfung auf einem echten Mac mit eingerichteter Convex-Umgebung. Was dort aussteht, steht in [Verifikation](verification.md). Developer-ID-Signierung, Notarisierung und Verteilung sind noch nicht eingerichtet.

## Dokumentationsgrundlage

- [Shoo](https://shoo.dev): Authorization Code mit PKCE, `client_id` aus der Origin der Redirect-URI.
- [Raycast Notes](https://manual.raycast.com/notes): Ein-Fenster-Bedienung, Checkboxen, Tastaturbefehle und Panels mit Suchfeld.
- [Electron-Fensteroptionen](https://www.electronjs.org/docs/latest/api/structures/base-window-options): Panel, Titelleiste mit Ampelknöpfen und Fensterverhalten.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): Vordergrund, Schreibtische und Vollbild.
- [Electron app](https://www.electronjs.org/docs/latest/api/app): `showEmojiPanel` für die Emoji-Auswahl von macOS.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): macOS-Schlüsselbund und verschlüsselte Geheimnisse.
- [Electron-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security): Renderer-Sandbox und IPC-Grenzen.

Glaze wurde erneut geprüft. Seine öffentliche Beta-Dokumentation bestätigt geeignete Fensterfähigkeiten, liefert hier aber keinen installierten, überprüfbaren Projektstarter. Deshalb ist dieser Client als eigenständiges Electron-Paket implementiert. Die gemeinsame Aufgaben-API bleibt auch für einen späteren Glaze-Client nutzbar.
