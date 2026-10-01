# todo für macOS

Der Desktop-Client ist ein kleines schwebendes Aufgabenfenster nach dem Vorbild der Raycast Notes. Er verwendet dieselben Convex-Aufgaben wie die Web-App. Es gibt keinen zweiten Markdown-Bestand und keinen Offline-Aufgabenspeicher.

## Starten und bauen

Voraussetzungen sind der installierte Workspace, Node 24 und macOS auf Apple Silicon. Die Befehle werden im Repository ausgeführt:

```bash
vp run @todo/desktop#dev
vp run @todo/desktop#build
vp run @todo/desktop#package
```

Alternativ die Paketbefehle im Verzeichnis `apps/desktop` ausführen:

```bash
node scripts/dev.mjs
node scripts/build.mjs
node scripts/package.mjs
```

Der Entwicklungsbefehl baut Main und Preload, startet einen lokalen Vite-Server und öffnet das Electron-Fenster. Rendereränderungen erscheinen per HMR. Änderungen an Main oder Preload benötigen einen Neustart dieses Befehls. Der Produktionsbuild enthält nur lokale Rendererdateien; ein laufender Webserver ist für die Desktop-App nicht erforderlich.

Der Paketbefehl erstellt:

- `apps/desktop/release/todo-darwin-arm64/todo.app`
- `apps/desktop/release/todo-0.2.0-mac-arm64.zip`

Das Paket wird lokal gebaut und weder installiert noch hochgeladen. Es besitzt keine Developer-ID-Signatur und keine Apple-Notarisierung. Für die spätere Verteilung muss dieser Schritt mit einem passenden Apple-Zertifikat ergänzt werden. Eine konsistente Signatur verhindert außerdem unnötige Schlüsselbund-Rückfragen bei Updates. Die Buildwerkzeuge und Electron-Version sind im Paketmanifest festgehalten; Builds verwenden denselben Versionssatz, ZIP-Zeitstempel machen sie nicht byteidentisch.

## Mit den Aufgaben verbinden

In der Web-App unter Einstellungen einen eigenen benannten Geräteschlüssel erzeugen. Die ausgegebenen Verbindungsdaten in das Desktop-Fenster einfügen. Alternativ Backend-URL und Schlüssel getrennt eingeben. Die URL muss eine HTTPS-Adresse der vorgesehenen Convex-Umgebung sein, beispielsweise `https://dein-projekt.convex.site`.

Die Verbindung wird vor dem Speichern überprüft. Das Main-Modul verwendet `@todo/native-client` und `POST /auth/device-token`, um mit dem Geräteschlüssel ein kurzlebiges Convex-JWT abzurufen. Der Renderer abonniert anschließend Convex direkt. Ein widerrufener oder abgelaufener Schlüssel führt zu einem erneuten Verbindungsdialog. Ein Netzwerkfehler löscht keinen gespeicherten Schlüssel.

Die einmalige Eingabe verschwindet nach erfolgreicher Übergabe aus dem Formular. Dauerhaft liegt der Schlüssel ausschließlich als `connection.enc` unter dem Electron-Nutzerverzeichnis, auf macOS normalerweise `~/Library/Application Support/todo/`. Varianten aus `dev` oder mit `TODO_DESKTOP_VARIANT` verwenden `~/Library/Application Support/todo-<variante>/`. Electron `safeStorage` verschlüsselt die Datei mithilfe des macOS-Schlüsselbunds. Wenn dieser nicht verfügbar ist, wird kein Klartext-Fallback angelegt. Der Main-Prozess gibt über die Preload-Schnittstelle nur den Verbindungsstatus, die öffentliche Backend-URL, Fenstereinstellungen und kurzlebige JWTs aus.

Fensterposition, Größe, Farbe, Kurzbefehl und Autostartpräferenz liegen separat in `window.json`. Diese Datei enthält keine Aufgaben und keine Zugangsdaten. „Verbindung entfernen“ löscht den lokalen verschlüsselten Schlüssel, ohne Aufgaben im Backend zu verändern. Das Widerrufen eines Geräteschlüssels in der Web-App sperrt seinen Backendzugriff.

## Bedienung

Das Fenster startet mit der gemeinsamen Prioritätsansicht. Die Bereichswahl oben rechts wechselt zwischen Priorität, me, agency, work, Habits und Verlauf. In jedem Bereich stehen Tasks und Backlog untereinander. Für später geplante Aufgaben bleiben in einem aufklappbaren Abschnitt erreichbar.

| Aktion                                  | Bedienung                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Fenster zeigen oder fokussieren         | `⌘⇧Leertaste`                                                           |
| Bereits fokussiertes Fenster ausblenden | Derselbe globale Kurzbefehl                                             |
| Priorität, me, agency, work, Habits     | `⌘1` bis `⌘5`                                                           |
| Neue Aufgabe fokussieren                | `⌘N`                                                                    |
| Aufgabe erfassen                        | Text eingeben und `Enter`                                               |
| Titel bearbeiten                        | Auf den Titel klicken, `Enter` speichert, `Escape` verwirft den Entwurf |
| Fokussierte Aufgabe erledigen           | `⌘Enter` oder Checkbox                                                  |
| Fokussierte Aufgabe umsortieren         | `⌥↑` und `⌥↓`                                                           |
| Fenster ausblenden                      | `Escape` oder `⌘W`                                                      |
| Fenstereinstellungen                    | `⌘,`                                                                    |

Der globale Kurzbefehl kann in den Fenstereinstellungen geändert werden. Belegte oder ungültige Tastenkombinationen werden abgewiesen; der vorherige Kurzbefehl bleibt erhalten. Der Menüleisteneintrag öffnet die Bereiche, schaltet Vordergrund und Schreibtischverhalten um und beendet die App. Das Schließen des Fensters blendet es aus; die Menüleiste bleibt verfügbar. Autostart ist optional und wird ausschließlich auf ausdrückliche Auswahl in der installierten App aktiviert.

Tasks besitzen höchstens eine Ebene von Subtasks. Das Abschließen eines Kindes schließt seinen Parent nicht ab. Erledigte Einträge stehen oben und bleiben bis zum serverseitigen Tageswechsel sichtbar. Die manuelle Reihenfolge ist innerhalb der offenen beziehungsweise erledigten Geschwister veränderbar. Das Entfernen der Inbox-Markierung ändert keine Position.

Die Aufgabendetails enthalten Projekt, Bereich, Aktiv/Backlog, KI, hohe Priorität, Planungstag, verbindlichen Termin und Snooze. Termine sind voneinander getrennt; eine überfällige Aufgabe kann wieder normal eingeordnet werden. Verwerfen erzeugt keinen Erledigungseintrag. Die kompakte Verlaufsansicht zeigt Abschlussmomentaufnahmen einschließlich Parent- und Projektkontext. Umfassende Einstellungen, Schlüsselverwaltung und Exporte bleiben in der Web-App.

## Fenster und Sicherheitsgrenzen

Electron 44.2.0 erstellt auf macOS ein `panel` mit `floating`-Fensterlevel. `setVisibleOnAllWorkspaces` mit `visibleOnFullScreen` hält es auf allen Schreibtischen und über Vollbild-Apps sichtbar. Die installierte App ist mit `LSUIElement` als Menüleisten-App markiert. Sie blendet sich beim Wechsel zur anderen App nicht selbst aus. Der Hintergrund verwendet native Vibrancy; vollständig transparente Browserfenster mit ihren Resize-Einschränkungen werden vermieden.

Nur die Titelleiste ist eine Ziehfläche. Buttons und Eingaben sind davon ausgenommen. Das Fenster lässt sich über seine Ränder vergrößern. Beim Wiederherstellen werden gespeicherte Grenzen gegen die tatsächlich angeschlossenen Displays geprüft. Nach Entfernen eines Displays wird ein betroffenes Fenster auf einen erreichbaren Schreibtisch zurückgeholt.

Der Renderer läuft mit Sandbox, `contextIsolation`, ausgeschalteter Node-Integration und einer Content Security Policy. Fremdnavigation, neue Fenster, Webviews und Browserberechtigungen sind gesperrt. Jede IPC-Anfrage muss aus dem Main-Frame genau dieses Fensters und seiner erlaubten lokalen Datei beziehungsweise Entwicklungsorigin stammen. Die wenigen IPC-Eingaben werden zusätzlich geprüft. Im Entwicklungsmodus ist die React-HMR-Preamble erlaubt; der Produktionsbuild erlaubt keine Inline-Skripte.

Die App speichert keine Aufgaben lokal und bestätigt Änderungen erst nach erfolgreicher Mutation. Während einer erkannten Verbindungsunterbrechung sind Schreibaktionen gesperrt. Ein fehlgeschlagener Abschluss bleibt offen; ein nicht gespeicherter Erfassungsentwurf bleibt im Eingabefeld.

## Verifikation

```bash
vp test run apps/desktop/test
```

Die Tests prüfen erlaubte Renderer-Origins und IPC-Argumente, Monitorwechsel, verschlüsselte Speicherung ohne Klartext-Fallback, fehlgeschlagene Erfassung und Abschlüsse, Schreibsperren bei Verbindungsunterbrechung, getrennte Parent-/Subtask-Abschlüsse und das Entfernen einmalig eingegebener Zugangsdaten aus dem Formular.

Build und Tests ersetzen nicht die Betriebsprüfung mit einer eingerichteten Convex-Umgebung. Dort sind insbesondere zwei gleichzeitig verbundene Clients, Schlüsselwiderruf, Tokenerneuerung, Wechsel zwischen Schreibtischen, Vollbild-Apps und die Fokusübergabe auf dem tatsächlichen Mac zu prüfen. Developer-ID-Signierung, Notarisierung und Verteilung sind noch nicht eingerichtet.

## Dokumentationsgrundlage

- [Raycast Notes](https://manual.raycast.com/notes): Ein-Fenster-Bedienung, Checkboxen und Tastaturbefehle.
- [Electron-Fensteroptionen](https://www.electronjs.org/docs/latest/api/structures/base-window-options): Panel, Vibrancy und Fensterverhalten.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): Vordergrund, Schreibtische und Vollbild.
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage): macOS-Schlüsselbund und verschlüsselte Geheimnisse.
- [Electron-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security): Renderer-Sandbox und IPC-Grenzen.

Glaze wurde erneut geprüft. Seine öffentliche Beta-Dokumentation bestätigt geeignete Fensterfähigkeiten, liefert hier aber keinen installierten, überprüfbaren Projektstarter. Deshalb ist dieser Client als eigenständiges Electron-Paket implementiert. Die gemeinsame Aufgaben-API bleibt auch für einen späteren Glaze-Client nutzbar.
