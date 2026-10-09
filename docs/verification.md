# Verifikation

## Automatisierte Prüfungen

`vp run qa` prüft Formatierung, Lint einschließlich Typanalyse,
Workspace-Konventionen, alle TypeScript-Pakete und die Verhaltenstests.

| Testbestand              | Geprüftes Verhalten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                  | Aufgabenregeln, Wiederholungen, DST/Tageswechsel, Shoo-Tokenprüfung, Desktop-Callback, Codetausch und Besitzerzuordnung, Geräte- und Integrationsschlüssel, Schlüsselliste und -widerruf, Grenze von 30 aktiven Schlüsseln, HTTP-Idempotenz, Geräte-JWTs, 403 für Integrationsschlüssel an `/auth/device-token`, aktuelle Habit-Snapshots ohne normale Aufgaben                                                                                                                                                                                                                                                                                                                                                                                                 |
| Listen im Backend        | Umstellung alter Bereichsdaten beim ersten Schreiben und vor dem ersten HTTP-Lesen, wiederholbar ohne Änderung, Startlisten, Anlegen, Bearbeiten und Ordnen von Listen, Löschen nur ohne Aufgaben und Wiederholungen, Löschen einer Wiederholung verwirft ihre offene Instanz und behält den Verlauf, Trennung nach Besitzer, Wichtig über alle Listen samt offener Zahlen, `GET /lists`, 404 für fremde und unbekannte Listen, 400 für feste Listen, die veralteten Felder `area`, `list` und `projectName` und die alten Ansichtsnamen                                                                                                                                                                                                                        |
| Aufgaben in Listen       | Wiederöffnen am selben Tag für Aufgaben, Habits und Subtasks, auch über `POST /tasks/:id/reopen`, Ablehnung für frühere Tage, Ein- und Ausrücken, Habit-Reihenfolge über den Tageswechsel, Umbenennen der Vorlage über eine Instanz, Habit-Punkte der Vortage aus Erledigungen, auch aus alten Einträgen ohne `recurrenceId`                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Gemeinsamer Geräteclient | Gespeicherte Verbindungsdaten samt Region, Gerätelogin mit Schlüsselart und Widerruf, Token-Erneuerung, gebündelte Abrufe und Fehler                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Desktop                  | Loopback-Anmeldung mit PKCE, State, Abbruch und Zeitüberschreitung, nur eine Shoo-Anmeldung zur Zeit, Vertrauensgrenzen für IPC, alte `window.json` mit Fensterfarbe behält die übrigen Einstellungen, Monitorwechsel, verschlüsselte Speicherung, Provider-Cleanup, Datumstexte der Zeilen, getippte Tage und Uhrzeiten im Datumspanel, Vorschläge und Zurückstellen über die Zeitumstellung                                                                                                                                                                                                                                                                                                                                                                   |
| Desktop-Oberfläche       | Anmeldung mit `↵` und `esc`, abgelehnter Geräteschlüssel, Offline-Ansicht und erneuter Start, leeres Fenster beim Laden, Statuspunkt, Schreibsperre ohne Verbindung, `⌘1` bis `⌘9`, in `⌘P` Anlegen, Favoriten, Reihenfolge mit `⌥↑` und `⌥↓` und alle Listenkürzel, `esc` erst für das Bearbeiten, dann für Panels, dann für das Fenster, Abschnitte, Zeilendetails und VoiceOver-Texte, Auswahl und Aufklappen, stilles Entfernen des Inbox-Punkts, Umbenennen, `⌘N`, `⌘↵` mit Wiederöffnen, `⇥` und `⇧⇥` außer in Wichtig, Aktionen in `⌘K`, `⌘⌫` leert erst die Suche, Datumspanel, Verschieben, Fenstereinstellungen und Kurzbefehl, Integrationsschlüssel und Widerruf, Standardliste und Zeitzone, Wichtig, Habits, Verlauf, Wiederholungen samt Löschen |
| Logging                  | Keine Bodies, Aufgabentitel oder Zugangsdaten in strukturierten Ereignissen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Fachtests verwenden isolierte Daten und eine kontrollierte Uhr. Sie verändern
keine persönlichen Aufgaben im Produktivbackend.

`apps/desktop/test/ui.test.tsx` rendert die ganze App in happy-dom gegen ein
nachgebildetes Convex im Arbeitsspeicher und prüft die Argumente der Mutationen.

## Listen und neue Oberfläche

Die Version mit Listen ist nirgends deployt. Die neue Oberfläche lief bisher
nur gegen ein nachgebildetes Convex in einem versteckten Electron-Fenster.
Bildschirmfotos der Ansichten und Panels entsprachen dem Entwurf, und die
ausgelösten Mutationen hatten die erwarteten Argumente. Auf einem echten Mac
und gegen ein echtes Backend stehen aus:

- Die Ampelknöpfe des `panel`-Fensters mit `titleBarStyle: "hidden"` sitzen
  mittig in der 40 Pixel hohen Titelleiste. Minimieren und Zoomen sind grau,
  Schließen blendet das Fenster aus. Ein Doppelklick auf die Titelleiste zoomt
  nicht, und Ziehen funktioniert, auch während ein Panel offen ist.
- Die Emoji-Auswahl aus `app.showEmojiPanel()` schreibt in das fokussierte
  Feld des Panels, obwohl das Fenster die App nicht aktiviert. `⌃⌘Leertaste`
  erreicht den Renderer vor dem macOS-Menüeintrag für Emoji und Symbole, direkt
  in der Listensuche und in den Listenaktionen. Die Zeile "Emoji wählen"
  funktioniert in jedem Fall.
- Die Umstellung mit echten Daten nach einem Backup, siehe
  [Entwicklung](development.md#umstellung-auf-listen). Danach gibt es die
  sieben Startlisten, jede Aufgabe steht in der Liste ihres Bereichs und im
  richtigen Abschnitt, Habits behalten ihre Reihenfolge, die Standardliste
  entspricht dem alten Standardbereich, alte Erledigungen zeigen im Verlauf
  das passende Emoji, und Wiederholungen stehen bei ihrer Liste.
- Wieder öffnen einer heute erledigten Aufgabe und eines Habits. Der Eintrag
  verschwindet aus dem Verlauf und aus `GET /completions`.
- Eine über die API erfasste Aufgabe zeigt den blauen Inbox-Punkt, verliert
  ihn bei der Auswahl und bleibt an ihrer Position.
- Bei einer echten Netzunterbrechung wird der Statuspunkt gelb und nach drei
  Sekunden rot, Schreibversuche zeigen den Hinweis.
- Das Menüleistenmenü öffnet Wichtig, Verlauf, Wiederholungen, die
  Listensuche und die Einstellungen.
- Der Capture-Skill legt mit einem Integrationsschlüssel über `listId` in der
  richtigen Liste an.

Eine bekannte Grenze betrifft die Aufnahme des Kurzbefehls. Drückt man dabei
den gerade registrierten globalen Kurzbefehl, fängt ihn der Main-Prozess ab
und blendet das Fenster aus.

## Anmeldung aus der Desktop-App

Der Login über Shoo in der Desktop-App ist bisher nur automatisiert getestet.
Einstellungen, Schlüsselliste und Wiederholungen liefen nur gegen ein
nachgebildetes Convex. Gegen das echte Deployment stehen aus:

- Deploy der neuen Endpunkte unter `/auth` und Eintrag der Site-Origin in `SHOO_OWNER_SUBJECTS`.
- Erste Anmeldung mit HTTP 403 und angezeigtem Mapping, danach erfolgreiche Anmeldung.
- Tokenerneuerung über `/auth/device-token` und Widerruf über "Abmelden".
- Integrationsschlüssel mit echter Shoo-Bestätigung erzeugen, damit `/api/v1` aufrufen, an `/auth/device-token` HTTP 403 erhalten und ihn in der Liste mit `⌘⌫` widerrufen.
- Standardliste und Zeitzone ändern und das Ergebnis über die API prüfen. Eine Aufgabe ohne `listId` landet in der neuen Standardliste.
- Eine Wiederholung umbenennen, pausieren, fortsetzen und löschen. Danach lässt sich ihre sonst leere Liste löschen.

## Stand 5. September 2026

Damals lief noch die inzwischen entfernte Web-App. Gegen das
Convex-Produktionsdeployment ergaben reale Prüfungen:

- `/auth/device-token`: HTTP 200, fünf Minuten Laufzeit, `apiKeyId` im JWT.
- `/api/v1/habits/snapshot`: HTTP 200, fünf vorhandene Habits mit dem aktuellen `occurrenceKey`.
- Web-App und macOS-Client lasen gleichzeitig denselben Datenbestand.

Das arm64-Paket wurde gebaut und als echte Electron-App gestartet. Nach dem
Verbindungsdialog, nach lokaler Abmeldung und nach erneuter Verbindung waren
alle sechs Ansichten der damaligen Oberfläche und die Einstellungen ohne
Renderer- oder Konsolenfehler und ohne horizontalen Überlauf. Native
Laufzeitprüfungen bestätigten das sichtbare Fenster, `alwaysOnTop`, alle
Schreibtische, den registrierten globalen Kurzbefehl, die Renderer-Sandbox,
den isolierten Preload und die deaktivierte Node-Integration. Der
macOS-Schlüsselbund war verfügbar, und `connection.enc` enthielt den
Geräteschlüssel nicht im Klartext.

## Weitere Betriebsarbeit

Die App ist nicht mit einer Apple Developer ID signiert oder notarisiert.
Manuelles Wechseln zwischen mehreren Spaces und fremden Vollbild-Apps gehört
zur persönlichen Betriebsabnahme. Die nativen Fensteroptionen dafür sind
gesetzt und geprüft.
