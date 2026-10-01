---
name: task-capture
description: Leite auf ausdrücklichen Wunsch Aufgaben aus einem Gespräch ab und erfasse sie über die persönliche todo-API. Prüfe vorher den Bestand und frage bei möglichen inhaltlichen Dubletten nach. Nicht zur automatischen Gesprächsüberwachung.
---

# Aufgaben aus Gesprächen erfassen

Verwende diesen Ablauf, wenn der Nutzer ausdrücklich Aufgaben ableiten oder
erfassen lassen möchte. Die Erwähnung einer Idee allein ist kein Schreibauftrag.
Die API-Adresse und der Anwendungsschlüssel kommen aus `TODO_API_URL` und
`TODO_API_KEY` oder einer vom Nutzer bereitgestellten sicheren Konfiguration.
`TODO_API_KEY` ist ein Integrationsschlüssel. Der Nutzer erzeugt ihn in der
todo-Desktop-App unter Einstellungen > Schlüssel > Neuer Integrationsschlüssel
und sieht ihn dabei nur einmal. Fehlt er, den Nutzer darum bitten. Keine
Deployment- oder Admin-Schlüssel verwenden; Schlüssel niemals ausgeben.

Lies für konkrete Requests [den API-Vertrag](../../docs/api.md). Er gilt auch
für Größenlimits, Antwortformate und Fehler. Zugangsdaten fehlen zu lassen
ist kein Anlass, sie in Projektdateien oder Shell-Historien zu suchen.

1. Lies den relevanten Bestand über `GET /tasks?view=all`, gegebenenfalls mit
   `area`, `search` und weiteren Seiten über `nextCursor`. Prüfe auch Projekt-
   und Parent-Kontext. Eine einzelne exakte Titelsuche findet nicht alle
   inhaltlichen Überschneidungen.
2. Formuliere verständliche Aufträge. Nutze `me`, `agency` oder `work`, soweit
   aus dem Gespräch bekannt. Unbekannte Zuordnungen nicht aus einem
   Repository-Organisationsnamen erfinden. Ohne Bereich greift der Standard.
   Bei agency und work bekannten Projektkontext angeben.
3. Verwende Subtasks für getrennte Arbeitsstränge, höchstens zwei Ebenen.
   Ein großer zusammenhängender Auftrag darf ein Task bleiben. Schreibe keine
   Implementierungspläne, Architekturabschnitte oder technischen Checklisten
   in Aufgabentexte. Subtasks haben keine eigene hohe Priorität.
4. Bei möglicher Dublette ausdrücklich fragen, ob dieselbe Aufgabe gemeint
   ist oder worin der Unterschied besteht. Bis zur Antwort weder die
   betroffene Dublette anlegen noch bestehende Aufgaben zusammenführen.
5. Neue Einträge mit Inbox-Markierung anlegen und `isAi` passend setzen.
   Technische Idempotenzschlüssel sind von inhaltlicher Ähnlichkeit getrennt.
   Pro logischem Schreibbefehl eine neue UUID erzeugen und sie für dessen
   identische Retries aufbewahren. Nach `CONFLICT` den Bestand prüfen,
   statt den Fehler mit einer neuen UUID zu umgehen.
6. Nur vom Server bestätigte Änderungen zurückmelden. Bei Netzfehlern nicht
   behaupten, eine Aufgabe sei gespeichert. Erledigungen nur auf ausdrücklichen
   Wunsch setzen; ein gestarteter KI-Thread ist keine Erledigung.

Inbox entfernen verändert nur die Markierung. Verwerfen erzeugt keine
Erledigung. Entwicklungsaufgaben gelten für diesen Nutzer nach Merge,
Deployment und Test als fertig. Bei Kommunikation kann der eigene erste
Beitrag genügen. Die weitere Threadorganisation bleibt im KI-Tool.
