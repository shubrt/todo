# Architektur

| Paket              | Aufgabe                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `apps/web`         | React, TanStack Start, responsive Oberfläche und Shoo-Loginrouten              |
| `libs/backend`     | Convex-Datenmodell, Fachoperationen, Autorisierung, HTTP-API und Zeitsteuerung |
| `libs/contracts`   | Validierte externe Eingaben und gemeinsame Typen                               |
| `libs/logging`     | Strukturierte Console-Ereignisse und serverseitiger evlog-/Axiom-Adapter       |
| `tools/typescript` | Gemeinsame TypeScript-Konfiguration                                            |

Die Web-App abonniert Convex-Queries direkt. Änderungen über externe HTTP
Actions verwenden dieselben fachlichen Mutationen und aktualisieren damit
auch geöffnete Webclients. TanStack Start stellt Login- und Sessionrouten
bereit. Nitro erzeugt einen später auf Railway ausführbaren Node-Server.

## Identität

Shoo Authorization Code mit PKCE und State führt zu einer eigenen App-Sitzung.
Convex prüft den Shoo-Nachweis selbst. Nur explizit konfigurierte Shoo-Subjects
werden derselben internen Owner-ID zugeordnet. Die Konfiguration berücksichtigt,
dass Shoo für verschiedene Origins verschiedene Subjects ausstellen kann.

Der Browser hält das zufällige Sitzungstoken in einem HttpOnly-Cookie. Convex
speichert ausschließlich dessen Hash. Ein kurzlebiges ES256-JWT verbindet den
reaktiven Client mit der Sitzung. Jede öffentliche Fachfunktion prüft den
Owner und die aktive Sitzung. Das Lesen der Sitzung gehört zu den reaktiven
Abhängigkeiten, damit ein Widerruf bestehende Abonnements invalidiert.

Benannte API-Schlüssel bilden einen separaten Zugangsweg für Integrationen.
Ihr vollständiger Wert erscheint nur bei der Erzeugung. Der Backendbestand
enthält den Hash und das sichtbare Präfix. Deployment-Schlüssel gehören nicht
zum laufenden Webserver oder zu externen Aufgabenintegrationen.

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
Periode. Aufgabentitel, Bodies, Cookies und Schlüssel gehören nicht zum
Ereignisvertrag. Der Node-Adapter initialisiert evlog einmal und aktiviert
Axiom nur bei gesetzter Konfiguration. Der Convex-Adapter verwendet ausschließlich
strukturierte Console-Ausgabe und hat keine Node- oder Netzwerkabhängigkeit.

Die fachliche Historie hängt weder von Axiom noch von der Logaufbewahrung ab.
Ein nativer Convex-Log-Stream kann bei der späteren Inbetriebnahme gewählt werden.
Diese Implementierung bucht keinen Tarif und erzeugt keine Cloud-Umgebung.
