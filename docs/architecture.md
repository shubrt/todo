# Architektur

| Paket                | Aufgabe                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `apps/desktop`       | Electron-Menüleisten-App, schwebendes macOS-Fenster, Anmeldung, Gerätespeicher |
| `libs/backend`       | Convex-Datenmodell, Fachoperationen, Autorisierung, HTTP-API und Zeitsteuerung |
| `libs/contracts`     | Validierte externe Eingaben und gemeinsame Typen                               |
| `libs/native-client` | Verbindungsdaten, Adressprüfung und Token-Erneuerung                           |
| `libs/logging`       | Strukturierte Console-Ereignisse für Convex                                    |
| `tools/typescript`   | Gemeinsame TypeScript-Konfiguration                                            |

Der Renderer der Desktop-App abonniert Convex-Queries direkt. Die HTTP-API
verwendet dieselben fachlichen Mutationen. Eine Änderung über die API erscheint
deshalb sofort im geöffneten Fenster.

## Identität

Die Desktop-App meldet sich bei Shoo per Authorization Code mit PKCE an. Shoo
leitet die `client_id` aus der Origin der Redirect-URI ab und vergibt pro
Origin ein eigenes `sub`. Ein Custom Scheme wie `todo://` hat die Origin
`null`. Ein zufälliger Loopback-Port würde die Origin und damit das `sub` bei
jeder Anmeldung ändern. Die Redirect-URI ist deshalb ein fester HTTPS-Endpunkt
auf der Convex-Site, `<site>/auth/desktop/callback`. Er prüft nur das Format
des State und leitet den Browser an den Loopback-Listener der App weiter. Den
Code tauscht er nicht ein, denn den PKCE-Verifier kennt nur die App. Erst
`POST /auth/desktop-login` erhält Code und Verifier zusammen. Ein abgefangener
Code allein nützt nichts.

Convex tauscht den Code bei Shoo ein und prüft das ID-Token selbst.
`SHOO_OWNER_SUBJECTS` ordnet das `sub` für die Site-Origin der internen
Owner-ID aus `TODO_OWNER_ID` zu. Ohne Eintrag weist das Backend die Anmeldung
ab. Mit Eintrag legt es einen Schlüssel `todo_…` an und gibt ihn genau einmal
zurück. Gespeichert werden nur SHA-256-Hash, sichtbares Präfix, Name und Art
(`kind`). Eine normale Anmeldung erzeugt einen Geräteschlüssel (`device`).
Mit `kind: "integration"` entsteht ein Integrationsschlüssel für ein Werkzeug.
Die App verlangt dafür eine frische Shoo-Anmeldung, damit ein gestohlener
Geräteschlüssel allein keine dauerhaften Schlüssel erzeugen kann. Schlüssel
aus der Zeit vor den Arten haben kein `kind` und verhalten sich wie
Geräteschlüssel. Höchstens 30 Schlüssel aller Arten dürfen gleichzeitig aktiv
sein. Widerrufene und abgelaufene zählen nicht mit.

Für Convex-Abonnements tauscht die App den Schlüssel über
`POST /auth/device-token` gegen ein ES256-JWT mit `apiKeyId`, das höchstens
fünf Minuten gilt. Öffentliche Fachfunktionen akzeptieren nur solche
Geräte-JWTs und lesen die Schlüsselzeile bei jedem Zugriff. Ein Widerruf
beendet dadurch auch laufende Abonnements. Browser-Sitzungen gibt es nicht.
Integrationsschlüssel bekommen an `/auth/device-token` HTTP 403 und damit nie
ein JWT. Ein entwendeter Integrationsschlüssel kann deshalb keine anderen
Schlüssel lesen oder widerrufen.

Die HTTP-API unter `/api/v1` nimmt alle drei Arten direkt als Bearer-Token.
Deployment-Schlüssel gehören weder in die App noch in Integrationen.

Die Schlüsselliste der App liest die Query `auth.listApiKeys`. Sie liefert die
aktiven Schlüssel des Besitzers, neueste zuerst, mit `id`, `name`, `prefix`,
`kind`, `createdAt`, `lastUsedAt` und `current` für den Schlüssel der
aufrufenden App, aber ohne Hashes. `lastUsedAt` setzen Token-Abrufe,
API-Schreibbefehle und der Habit-Stand, höchstens einmal pro Stunde. Lesende
API-Aufrufe ändern es nicht.
Die Mutation `auth.revokeApiKey` widerruft einen Schlüssel per `id`. Für einen
schon widerrufenen Schlüssel ändert sie nichts. Den Schlüssel der aufrufenden
App lehnt sie mit `INVALID_INPUT` ab, dafür gibt es "Verbindung entfernen".
Beide Funktionen prüfen das Geräte-JWT wie `requireOwner` und arbeiten nur
auf Schlüsseln desselben Besitzers. Anmeldung und Schlüsselverwaltung aus
Sicht der App beschreibt die Desktop-Dokumentation unter
[Anmelden](desktop.md#anmelden) und [Schlüssel](desktop.md#schlüssel).

## Aufgaben, Historie und Zeit

Aktueller Zustand und Erledigungsnachweise liegen in getrennten Tabellen.
Abschluss und Snapshot entstehen atomar. Eine spätere Umbenennung oder
Archivierung verändert die Historie nicht. Wiederholungen speichern Vorlagen
und verarbeitete Kalenderperioden; die Prüfung und Erzeugung erfolgen in einer
Transaktion.

Ein Backend-Cron führt Tageswechsel aus und holt versäumte Zeitübergänge nach.
Geplante Aktivierungen prüfen eine Versionsnummer, damit alte Jobs geänderte
Termine nicht überschreiben. Queries verwenden gespeicherte Zeitstände für
reaktive Tagesansichten. Lokale Kalendertage werden anhand der IANA-Zeitzone
berechnet, Tagesgrenzen anhand des Kalenders statt mit einer festen 24-Stunden-Dauer.

Der Cron prüft jede Minute die lokalen Tagesgrenzen, auch ohne geöffnete Clients.
Konkrete Wiedervorlagen werden zusätzlich mit `runAt` geplant. Der einmalige
Positionswechsel bleibt gespeichert und wird bei späteren Cronläufen nicht
wiederholt. Ein Zeitzonenwechsel berechnet noch geplante Aktivierungen neu;
bereits gespeicherte Erledigungstage und Zeitzonen bleiben unverändert.

Kalenderregeln sind täglich, wöchentlich an einem ISO-Wochentag von 1 bis 7 oder
monatlich an einem gewählten Tag. Fehlt dieser Monatstag, wird der letzte Tag des
Monats verwendet. Eine Regel für den 31. fällt im Februar 2026 deshalb auf den 28. und im März wieder auf den 31. Vorlagen enthalten Titel, Bereich, Projekt,
KI-Kennzeichnung und hohe Priorität. Subtasks gehören zur einzelnen Instanz und
werden nicht als Wiederholungsvorlage kopiert.

Eine offene normale Wiederholung behält ihre ID und ursprüngliche Frist. Der
neue Zeitraum wird trotzdem als verarbeitet gespeichert. Ein späterer Abschluss
am selben Tag erzeugt deshalb keine zusätzliche Instanz. Nach einer Unterbrechung
wird nur der jüngste fällige Zeitraum verarbeitet.

Habits verwenden für jeden lokalen Tag neue Instanz-IDs. Erledigte und unerledigte
alte Instanzen werden aus der Arbeitsansicht archiviert. Nur echte Abschlüsse
erscheinen in der Historie. Ein verspäteter Abschluss einer alten offenen Instanz
wird zurückgewiesen und kann den heutigen Habit nicht verändern. Pausierte
Habit-Vorlagen erzeugen keine neuen Instanzen; beim Fortsetzen am selben Tag
wird die noch offene Instanz wieder angezeigt.

Die aktuelle Aufgabenliste liest den Index über Besitzer und fehlenden
Archivierungszeitpunkt. Der Verlauf verwendet einen Index über Besitzer und
lokalen Abschlusstag mit Convex-Pagination. API-Aufgabenlisten paginieren
Haupttasks und liefern deren Kinder zusammen mit dem Parent.

## Diagnose

Logs erlauben Operation, Ergebnis, Request-ID, Task-ID, Dauer, Fehlercode und
Periode. Aufgabentitel, Bodies und Schlüssel gehören nicht zum
Ereignisvertrag. `@todo/logging` schreibt ausschließlich strukturierte
Console-Ausgabe und hat keine Node- oder Netzwerkabhängigkeit.

Die fachliche Historie hängt nicht von der Logaufbewahrung ab. Einen
Convex-Log-Stream kann man bei der späteren Inbetriebnahme wählen. Diese
Implementierung bucht keinen Tarif und erzeugt keine Cloud-Umgebung.
