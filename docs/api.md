# HTTP-API

Die API liegt auf der Convex-HTTP-Origin:
`https://YOUR_DEPLOYMENT.convex.site/api/v1`. Sie erwartet einen
Anwendungsschlüssel `todo_…` als Bearer-Token. Integrationen wie der
Capture-Skill bekommen einen Integrationsschlüssel aus der Desktop-App:
Einstellungen > Schlüssel > Neuer Integrationsschlüssel. Die App verlangt
dafür eine erneute Shoo-Anmeldung, zeigt den Schlüssel genau einmal und
widerruft ihn im selben Abschnitt. Integrationsschlüssel gelten nur unter
`/api/v1`. Geräteschlüssel und ältere Schlüssel ohne Typ funktionieren hier
ebenfalls. Ein Convex-Deployment-Key ist ungeeignet. Den Ablauf beschreibt
[die Desktop-Dokumentation](desktop.md#schlüssel). Alle Anfragen erhalten eine
Request-ID; Fehler enthalten keine internen Stacktraces. `/api/v1` sendet keine
CORS-Header. Im Browser kann deshalb kein Skript einer Webseite die Antworten
lesen. Die Web-App braucht die API nicht, Integrationen außerhalb des Browsers
betrifft das nicht.

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

Bodies dürfen höchstens 32 KiB umfassen. Titel enthalten 1 bis 500 Zeichen.
Unbekannte Felder und Query-Parameter weist die API zurück.
Die vollständigen Schemas stehen in
[`libs/contracts/src/index.ts`](../libs/contracts/src/index.ts).

## Operationen

| Methode und Pfad                    | Body oder Filter                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /lists`                        | Keine Filter; alle Listen in der Reihenfolge der Seitenleiste                                               |
| `GET /tasks`                        | `listId`, `section`, `view`, `search`, `isAi`, `limit`, `cursor`                                            |
| `GET /tasks/:id`                    | Ein Task mit Subtasks, Liste und Abschnitt                                                                  |
| `POST /tasks`                       | `title`, optional `listId`, `section`, `isInbox`, `isAi`, `highPriority`, `plannedFor`, `dueOn`, `subtasks` |
| `PATCH /tasks/:id`                  | Geänderte Felder aus `title`, `isAi`, `highPriority`                                                        |
| `POST /tasks/:id/subtasks`          | `title`, optional `isAi`                                                                                    |
| `POST /tasks/:id/complete`          | `{}`, bei einer Wiederholung optional `occurrenceKey`                                                       |
| `POST /tasks/:id/reopen`            | `{}`; öffnet eine heute erledigte Aufgabe wieder                                                            |
| `DELETE /tasks/:id`                 | Kein Body nötig; verwirft die Arbeit ohne neuen Abschluss                                                   |
| `POST /tasks/:id/clear-inbox`       | `{}`                                                                                                        |
| `POST /tasks/:id/move`              | `listId` und/oder `section`                                                                                 |
| `POST /tasks/reorder`               | `taskIds` in gewünschter Reihenfolge, optional `listId`, `section`                                          |
| `POST /tasks/:id/reorder-subtasks`  | `taskIds` der Geschwister in gewünschter Reihenfolge                                                        |
| `POST /tasks/:id/plan`              | `plannedFor` und/oder `dueOn` als `YYYY-MM-DD`; `null` entfernt den Wert                                    |
| `POST /tasks/:id/snooze`            | `snoozedUntil` als UTC-Unixzeit in Millisekunden; `null` beendet Snooze                                     |
| `POST /tasks/:id/normalize-urgency` | `{}`; entfernt aktuelle Frist, Planung und hohe Priorität                                                   |
| `GET /completions`                  | `date` oder `from`/`to`, optional `listId`, `limit`, `cursor`                                               |
| `GET /habits/snapshot`              | Keine Filter; heutige Einträge der Liste Habits mit `occurrenceKey`                                         |

Ältere Felder wie `area` und `projectName` nimmt die API weiter an. Sie stehen
unter [Veraltete Felder](#veraltete-felder).

### Listen

`GET /lists` liefert in `data` alle Listen ohne Pagination, in der Reihenfolge
der Seitenleiste. Jede Liste hat `id`, `name`, `emoji` (`null` ohne Emoji),
`color` als `#rrggbb`, `kind` und `favorite`. Aufgaben gehören in Listen mit
`kind` `tasks`. Die übrigen Arten sind die festen Listen Habits (`habits`),
Wichtig (`important`), Verlauf (`history`) und Wiederholungen (`recurrences`).
Listen anlegen, umbenennen und löschen geht nur in der Desktop- und der Web-App.

```json
{
  "data": [
    {
      "id": "<list-id>",
      "name": "work",
      "emoji": "💻",
      "color": "#ff453a",
      "kind": "tasks",
      "favorite": true
    }
  ],
  "requestId": "<request-id>"
}
```

### Aufgaben

Jede Hauptaufgabe gehört zu einer Liste (`listId`) und dort zu einem Abschnitt
(`section`): `active` für Tasks oder `backlog`. Ein Subtask erbt beides vom
Parent und liefert es mit. Taskobjekte verwenden `_id` als stabile Identität.

`view` ist `all`, `list` oder `important`. Ohne Angabe gilt `all` mit allen
aktuellen Aufgaben. Die Bestandssuche findet so auch zurückgestellte Aufgaben.
`listId` grenzt jede Ansicht auf eine Liste ein. `list` zeigt eine Liste wie
die App, also ohne zurückgestellte Aufgaben vor ihrer Frist. Ohne `listId` ist
das die Standardliste, in der Liste Habits sind es die heutigen Habits.
`important` sammelt die Wichtig-Aufgaben aller Listen mit hoher Priorität oder
einer Frist bis heute. Eine unbekannte oder fremde `listId` ergibt
`404 NOT_FOUND`. Wichtig, Verlauf und Wiederholungen haben keine eigenen
Aufgaben, ihre `listId` ergibt `400 INVALID_INPUT`. Für Wichtig gilt
`view=important`. `isAi` wird als `true` oder `false` übergeben und findet auch
entsprechend markierte Subtasks. Der Parent und seine Kinder werden als
gemeinsamer Kontext geliefert.

Neue Aufgaben ohne `listId` landen in der Standardliste, die in der App unter
Einstellungen > Konto steht. Sie sind standardmäßig Inbox-Aufgaben und stehen
oben bei der offenen Arbeit im Abschnitt Tasks, ohne `highPriority` unter den
Aufgaben mit hoher Priorität. Zeigt `listId` auf eine Liste
einer anderen Art als `tasks`, antwortet die API mit `400 INVALID_INPUT`. Eine
bereits fällige Frist aktiviert eine Aufgabe auch dann, wenn beim Anlegen
`backlog` angegeben wurde. Habits entstehen nur in der App. Wiederkehrende
Aufgaben lassen sich derzeit weder über die API noch in der App anlegen.

`move` setzt eine Hauptaufgabe samt Subtasks oben in ihren Block im Ziel,
ohne `highPriority` unter die Aufgaben mit hoher Priorität. Ohne `listId` bleibt die Liste, ohne `section` der Abschnitt. Subtasks
und Habits wechseln die Liste nicht.

`GET /tasks` liefert Haupttasks mit ihren Subtasks. `limit` zählt Haupttasks,
nicht Kinder, und liegt zwischen 1 und 500. Aufgaben und Erledigungen
verwenden `data.items` und `data.nextCursor`. Solange `nextCursor` nicht `null`
ist, eine weitere Anfrage mit demselben Filter und diesem Cursor stellen. Ein
ungültiger Cursor führt zu einem Eingabefehler. Ändert sich der Bestand während
des Lesens, ist die Pagination keine eingefrorene Momentaufnahme. Cursor
unverändert übernehmen und als Query-Parameter URL-kodieren. Insbesondere die
Verlaufs-API verwendet einen undurchsichtigen Convex-Cursor.

```json
{
  "data": { "items": [], "nextCursor": null },
  "requestId": "<request-id>"
}
```

Schreibantworten enthalten `data.id`, bei reinen Sortieroperationen `null`.
Eigene Priorität oder eine dritte Ebene für Subtasks weist der Server ab.

Eine Sortierung kann eine Teilmenge nennen. Die genannten Einträge werden in
dieser Reihenfolge vor die übrigen Geschwister gesetzt. Die Anzeige hat drei
Blöcke: heute erledigte, offene mit `highPriority` und die übrigen offenen.
Eine Sortierung verschiebt nichts über diese Grenzen, innerhalb jedes Blocks
gilt die manuelle Reihenfolge. Alle IDs müssen zu derselben Liste und demselben
Abschnitt beziehungsweise zum angegebenen Parent gehören.

Eine organisatorisch geplante oder gesnoozte Aufgabe ist bis zur Wiedervorlage
in den Arbeitsansichten verborgen. Das gilt auch für eine manuelle hohe
Priorität. Eine bereits fällige verbindliche Frist bleibt dagegen sichtbar.
`normalize-urgency` entfernt Frist, Planung und hohe Priorität, behält aber einen
ausdrücklich gesetzten Snooze-Zeitpunkt bei. Zum sofortigen Einblenden zusätzlich
`snoozedUntil: null` senden.

Endet ein Snooze, trägt die Aufgabe `isWoken: true`, bis sie in der App
ausgewählt wird. Jeder Aufruf von `snooze` entfernt das Feld, auch mit `null`.
`clear-inbox` ändert daran nichts.

`reopen` öffnet eine Aufgabe wieder, die am heutigen lokalen Tag erledigt
wurde. Der Server löscht ihren Erledigungseintrag und setzt sie oben in ihren
Block, ohne `highPriority` unter die Aufgaben mit hoher Priorität. Ab dem
nächsten Tag ist sie archiviert, dann antwortet `reopen` mit `409 CONFLICT`. Bei einer offenen Aufgabe ändert `reopen` nichts. Wer die
Aufgabe danach erneut erledigt, braucht einen neuen `Idempotency-Key`. Der alte
liefert nur die gespeicherte Quittung und erledigt nichts.

### Habits

Habits erhalten beim Tageswechsel neue Instanz-IDs. Ein Abschluss mit einer alten
ID kann den heutigen Habit nicht erledigen. Der optionale `occurrenceKey`
prüft zusätzlich die erwartete Kalenderperiode. Ein bereits bestätigter
Abschluss erzeugt auch bei Wiederholung kein zweites Erledigungsereignis.

`GET /habits/snapshot` verarbeitet einen fälligen Tageswechsel vor dem Lesen,
auch wenn der stündliche Cron noch nicht gelaufen ist. `data` enthält
`generatedAt`, `localDate`, `timeZone`, `nextResetAt`, `completedCount`,
`totalCount` und `habits` mit den heutigen Einträgen der Liste Habits, jeweils
mit `id`, `title`, `completed` und `occurrenceKey`. `nextResetAt`
berücksichtigt Owner-Zeitzone und Sommerzeit. Nach diesem Zeitpunkt gelten die
IDs nicht mehr für den neuen Tag.

## Veraltete Felder

Die API nimmt die Felder aus der Zeit vor den Listen weiter an, damit ältere
Clients funktionieren. Neue Integrationen verwenden sie nicht.

- `area` (`me`, `agency` oder `work`) in `POST /tasks`, `move`, `reorder`,
  `GET /tasks` und `GET /completions` steht für die Liste, die aus diesem
  Bereich entstanden ist, auch nach einer Umbenennung. Zusammen mit `listId`
  ergibt das `400 INVALID_INPUT`. Ist diese Liste gelöscht, antworten
  `POST /tasks`, `move` und `GET /tasks` mit `404 NOT_FOUND`.
- `list` (`active` oder `backlog`) ist der alte Name von `section`. Ein
  Listenname wie `"list": "work"` ergibt `400 INVALID_INPUT`, ebenso `list`
  zusammen mit `section`.
- `projectName` in `POST /tasks` und `PATCH /tasks/:id` wird angenommen und
  ignoriert. Projekte sind eigene Listen.
- `view=priority` entspricht `important`, `view=area` entspricht `list`.
  `view=habits` liest die Liste Habits.
- `kind` in `POST /tasks/reorder` prüft nur noch, ob alle Einträge Aufgaben
  beziehungsweise Habits sind.

Antworten enthalten `area`, `list` und `projectName` nicht mehr. Erledigungen
aus der Zeit vor den Listen behalten `areaSnapshot` und `projectNameSnapshot`.

## Beispiele

Die folgenden Variablen werden lokal gesetzt. Schlüssel nicht in gemeinsam
genutzte Shellskripte schreiben. `TODO_API_KEY` ist ein Integrationsschlüssel
aus Einstellungen > Schlüssel.

```sh
export TODO_API_URL='https://YOUR_DEPLOYMENT.convex.site/api/v1'
```

Die Listen lesen, um die `id` der passenden Liste zu finden:

```sh
curl --fail-with-body --silent --show-error "$TODO_API_URL/lists" \
  --header "Authorization: Bearer $TODO_API_KEY"
```

Vor dem Anlegen eines ähnlichen Auftrags den Bestand lesen:

```sh
curl --fail-with-body --silent --show-error --get "$TODO_API_URL/tasks" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --data-urlencode 'search=Zeitbuchung' \
  --data-urlencode 'view=all'
```

Danach einen ausdrücklich gewünschten Auftrag in dieser Liste anlegen:

```sh
capture_request_id="$(uuidgen)"
curl --fail-with-body --silent --show-error "$TODO_API_URL/tasks" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --header 'Content-Type: application/json' \
  --header "Idempotency-Key: $capture_request_id" \
  --data '{"title":"Zeitbuchung umstellen","listId":"<list-id>","isAi":true,"subtasks":[{"title":"n8n umziehen"},{"title":"Neuen Workflow für Zeiten buchen festlegen"}]}'
```

Bei einem Retry den curl-Aufruf mit demselben `capture_request_id` wiederholen,
statt die Variable neu zu setzen. Inhaltliche Ähnlichkeit ist keine technische
Idempotenz. Bei möglicher Dublette fragt der Agent den Nutzer vor dem Schreiben.

Erledigungen eines Tages in einer Liste lesen:

```sh
curl --fail-with-body --silent --show-error --get "$TODO_API_URL/completions" \
  --header "Authorization: Bearer $TODO_API_KEY" \
  --data-urlencode 'date=2026-09-05' \
  --data-urlencode 'listId=<list-id>'
```

Die Erledigungen enthalten den damaligen Titel und Parent-Titel, die Liste als
`listId`, `listNameSnapshot` und `listEmojiSnapshot`, den UTC-Zeitpunkt, den
lokalen Tag und die dabei verwendete Zeitzone. Umbenennen oder Löschen der
Liste und die nächtliche Archivierung verändern diese Angaben nicht. Einträge
aus der Zeit vor den Listen tragen stattdessen `areaSnapshot` und
`projectNameSnapshot`. Ihre `listId` leitet der Server aus dem Bereich ab,
Habits gehören zur Liste Habits. Der `listId`-Filter findet auch diese
Einträge und die Erledigungen gelöschter Listen. Eine `listId`, die keine
Listen-ID sein kann, ergibt `404 NOT_FOUND`. Habits sind am `kind`
erkennbar. Habits und wiederkehrende Aufgaben tragen `recurrenceId`. Ein
`reopen` am selben Tag löscht den Eintrag.

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
| 404  | `NOT_FOUND`         | Aufgabe, Liste oder Operation fehlt                                             |
| 409  | `CONFLICT`          | Veralteter Zustand oder abweichender Inhalt beim Retry                          |
| 413  | `PAYLOAD_TOO_LARGE` | Body überschreitet 32 KiB                                                       |
| 503  | `NOT_CONFIGURED`    | Erforderliche Auth-Konfiguration fehlt                                          |
| 500  | `INTERNAL_ERROR`    | Interner Fehler; Request-ID für die Diagnose verwenden                          |

Ein normaler HTTP-Aufruf liefert eine Antwort. Live-Updates bekommen nur die
geöffneten Apps auf dem Mac und dem iPhone über ihre Convex-Abonnements. Die
Anmelde- und Geräteendpunkte unter `/auth` beschreibt
[die Desktop-Dokumentation](desktop.md#endpunkte-der-app).
