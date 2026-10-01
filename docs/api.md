# HTTP-API

Die API liegt auf der Convex-HTTP-Origin:
`https://YOUR_DEPLOYMENT.convex.site/api/v1`. Sie erwartet einen
Anwendungsschlüssel `todo_…` als Bearer-Token. Integrationen wie der
Capture-Skill bekommen einen Integrationsschlüssel aus der Desktop-App:
Einstellungen > Schlüssel > Neuer Integrationsschlüssel. Die App verlangt
dafür eine erneute Shoo-Anmeldung, zeigt den Schlüssel genau einmal und
widerruft ihn in derselben Liste. Integrationsschlüssel gelten nur unter
`/api/v1`. Geräteschlüssel und ältere Schlüssel ohne Typ funktionieren hier
ebenfalls. Ein Convex-Deployment-Key ist ungeeignet. Den Ablauf beschreibt
[die Desktop-Dokumentation](desktop.md#schlüssel). Alle Anfragen erhalten eine
Request-ID; Fehler enthalten keine internen Stacktraces.

```http
Authorization: Bearer todo_<application-key>
Content-Type: application/json
Idempotency-Key: <unique-command-id>
```

`Content-Type` ist für JSON-Bodies erforderlich. Jeder Schreibbefehl benötigt
einen `Idempotency-Key` mit 1 bis 128 druckbaren ASCII-Zeichen. Den gleichen
Schlüssel nur bei einer identischen Wiederholung desselben Befehls verwenden.
Die Quittung gilt sieben Tage und ist an den Anwendungsschlüssel gebunden.
Eine Wiederholung mit anderem Inhalt liefert `409 CONFLICT`. Authentifizierung,
Quittung und fachliche Änderung werden gemeinsam geprüft und geschrieben.

Bodies dürfen höchstens 32 KiB umfassen. Titel enthalten 1 bis 500 Zeichen,
Projektnamen bis zu 120 Zeichen. Unbekannte Felder werden zurückgewiesen.
Die vollständigen Schemas stehen in
[`libs/contracts/src/index.ts`](../libs/contracts/src/index.ts).

## Operationen

| Methode und Pfad                    | Body oder Filter                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /tasks`                        | `area`, `list`, `view`, `search`, `isAi`, `limit`, `cursor`                                                           |
| `GET /tasks/:id`                    | Ein Task mit Subtasks und geerbtem Kontext                                                                            |
| `POST /tasks`                       | `title`, optional `area`, `list`, `projectName`, `isInbox`, `isAi`, `highPriority`, `plannedFor`, `dueOn`, `subtasks` |
| `PATCH /tasks/:id`                  | Geänderte Felder aus `title`, `projectName`, `isAi`, `highPriority`                                                   |
| `POST /tasks/:id/subtasks`          | `title`, optional `isAi`                                                                                              |
| `POST /tasks/:id/complete`          | `{}`, bei einer Wiederholung optional `occurrenceKey`                                                                 |
| `DELETE /tasks/:id`                 | Kein Body nötig; verwirft die Arbeit ohne neuen Abschluss                                                             |
| `POST /tasks/:id/clear-inbox`       | `{}`                                                                                                                  |
| `POST /tasks/:id/move`              | `area` und/oder `list`                                                                                                |
| `POST /tasks/reorder`               | `taskIds` in gewünschter Reihenfolge, optional `area`, `list`, `kind`                                                 |
| `POST /tasks/:id/reorder-subtasks`  | `taskIds` der Geschwister in gewünschter Reihenfolge                                                                  |
| `POST /tasks/:id/plan`              | `plannedFor` und/oder `dueOn` als `YYYY-MM-DD`; `null` entfernt den Wert                                              |
| `POST /tasks/:id/snooze`            | `snoozedUntil` als UTC-Unixzeit in Millisekunden; `null` beendet Snooze                                               |
| `POST /tasks/:id/normalize-urgency` | `{}`; entfernt aktuelle Frist, Planung und hohe Priorität                                                             |
| `GET /completions`                  | `date` oder `from`/`to`, optional `area`, `limit`, `cursor`                                                           |
| `GET /habits/snapshot`              | Keine Filter; heutige Haupt-Habits mit `occurrenceKey`                                                                |

`area` ist `me`, `agency` oder `work`; `list` ist `active` oder `backlog`.
`view` ist `all`, `area`, `priority` oder `habits`. Die externe Bestandssuche
verwendet standardmäßig `all` und findet dadurch auch zurückgestellte Aufgaben.
`isAi` wird als `true` oder `false` übergeben und findet auch entsprechend
markierte Subtasks. Der Parent und seine Kinder werden als gemeinsamer Kontext
geliefert. Neue Eingänge sind standardmäßig Inbox-Aufgaben oben bei der offenen
Arbeit in der aktiven Liste des Standardbereichs. Eine bereits fällige Frist
aktiviert eine Aufgabe auch dann, wenn beim Anlegen `backlog` angegeben wurde.

Aufgabenlisten liefern Haupttasks mit ihren Subtasks. `limit` zählt Haupttasks,
nicht Kinder, und liegt zwischen 1 und 500. Listen und Erledigungen verwenden
`data.items` und `data.nextCursor`. Solange `nextCursor` nicht `null` ist, eine
weitere Anfrage mit demselben Filter und diesem Cursor stellen. Ein ungültiger
Cursor führt zu einem Eingabefehler. Ändert sich der Bestand während des Lesens,
ist die Pagination keine eingefrorene Momentaufnahme. Cursor unverändert
übernehmen und als Query-Parameter URL-kodieren. Insbesondere die Verlaufs-API
verwendet einen undurchsichtigen Convex-Cursor.

```json
{
  "data": { "items": [], "nextCursor": null },
  "requestId": "<request-id>"
}
```

Schreibantworten enthalten `data.id`, bei reinen Sortieroperationen `null`.
Taskobjekte verwenden `_id` als stabile Identität. Ein Subtask erbt Bereich,
Liste und Projekt vom Parent. Eigene Priorität oder eine dritte Ebene werden
serverseitig abgewiesen.

Eine Sortierung kann eine Teilmenge nennen. Die genannten Einträge werden in
dieser Reihenfolge vor die übrigen Geschwister gesetzt. Erledigte Einträge bleiben
im oberen Block; innerhalb des erledigten und des offenen Blocks gilt die
manuelle Reihenfolge. Alle IDs müssen zu derselben Liste beziehungsweise zum
angegebenen Parent gehören.

Eine organisatorisch geplante oder gesnoozte Aufgabe ist bis zur Wiedervorlage
in den Arbeitsansichten verborgen. Das gilt auch für eine manuelle hohe
Priorität. Eine bereits fällige verbindliche Frist bleibt dagegen sichtbar.
`normalize-urgency` entfernt Frist, Planung und hohe Priorität, behält aber einen
ausdrücklich gesetzten Snooze-Zeitpunkt bei. Zum sofortigen Einblenden zusätzlich
`snoozedUntil: null` senden.

Habits erhalten beim Tageswechsel neue Instanz-IDs. Ein Abschluss mit einer alten
ID kann den heutigen Habit nicht erledigen. Der optionale `occurrenceKey`
prüft zusätzlich die erwartete Kalenderperiode. Ein bereits bestätigter
Abschluss erzeugt auch bei Wiederholung kein zweites Erledigungsereignis.

`GET /habits/snapshot` verarbeitet einen fälligen Tageswechsel vor dem Lesen,
auch wenn der Minutencron noch nicht gelaufen ist. `data` enthält
`generatedAt`, `localDate`, `timeZone`, `nextResetAt`, `completedCount`,
`totalCount` und `habits` mit `id`, `title`, `completed` und `occurrenceKey`.
`nextResetAt` berücksichtigt Owner-Zeitzone und Sommerzeit. Nach diesem
Zeitpunkt gelten die IDs nicht mehr für den neuen Tag.

## Beispiele

Die folgenden Variablen werden lokal gesetzt. Schlüssel nicht in gemeinsam
genutzte Shellskripte schreiben. `TODO_API_KEY` ist ein Integrationsschlüssel
aus Einstellungen > Schlüssel.

```sh
export TODO_API_URL='https://YOUR_DEPLOYMENT.convex.site/api/v1'
```

Vor dem Anlegen eines ähnlichen Auftrags den Bestand lesen:

```sh
curl --fail-with-body --silent --show-error --get "$TODO_API_URL/tasks" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --data-urlencode 'search=Zeitbuchung' \
  --data-urlencode 'view=all'
```

Danach einen ausdrücklich gewünschten Auftrag anlegen:

```sh
capture_request_id="$(uuidgen)"
curl --fail-with-body --silent --show-error "$TODO_API_URL/tasks" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: $capture_request_id" \
  --data '{"title":"Zeitbuchung umstellen","area":"me","isAi":true,"subtasks":[{"title":"n8n umziehen"},{"title":"Neuen Workflow für Zeiten buchen festlegen"}]}'
```

Bei einem Retry den curl-Aufruf mit demselben `capture_request_id` wiederholen,
statt die Variable neu zu setzen. Inhaltliche Ähnlichkeit ist keine technische
Idempotenz. Bei möglicher Dublette fragt der Agent den Nutzer vor dem Schreiben.

Erledigungen eines Tages lesen:

```sh
curl --fail-with-body --silent --show-error --get "$TODO_API_URL/completions" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --data-urlencode 'date=2026-09-05' \
  --data-urlencode 'area=work'
```

Die Erledigungen enthalten den damaligen Titel, Parent-Titel, Bereich, Projekt,
UTC-Zeitpunkt, lokalen Tag und die dabei verwendete Zeitzone. Nächtliche
Archivierung verändert diese Angaben nicht. Habits sind am `kind` erkennbar.

## Fehler

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Dieser Idempotency-Key wurde bereits für eine andere Anfrage verwendet."
  },
  "requestId": "<request-id>"
}
```

| HTTP | Code                | Bedeutung                                                                       |
| ---- | ------------------- | ------------------------------------------------------------------------------- |
| 400  | `INVALID_INPUT`     | Ungültige Felder, Filter, Cursor oder fehlender Idempotenzschlüssel             |
| 401  | `UNAUTHENTICATED`   | Schlüssel oder Token fehlt, ist widerrufen oder abgelaufen                      |
| 403  | `FORBIDDEN`         | Shoo-Identität ohne Besitzer oder Integrationsschlüssel an `/auth/device-token` |
| 404  | `NOT_FOUND`         | Aufgabe oder Operation fehlt                                                    |
| 409  | `CONFLICT`          | Veralteter Zustand oder abweichender Inhalt beim Retry                          |
| 413  | `PAYLOAD_TOO_LARGE` | Body überschreitet 32 KiB                                                       |
| 503  | `NOT_CONFIGURED`    | Erforderliche Auth-Konfiguration fehlt                                          |
| 500  | `INTERNAL_ERROR`    | Interner Fehler; Request-ID für die Diagnose verwenden                          |

Ein normaler HTTP-Aufruf liefert eine Antwort. Live-Updates bekommt nur die
geöffnete Desktop-App über ihre Convex-Abonnements. Die Anmelde- und
Geräteendpunkte unter `/auth` beschreibt [die Desktop-Dokumentation](desktop.md#endpunkte-der-app).
