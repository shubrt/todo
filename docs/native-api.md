# Native Geräte und Widgets

Mobile und Desktop verwenden denselben Convex-Produktionsdatenbestand wie die
Web-App. Pro Gerät wird in den Web-Einstellungen ein eigener Anwendungsschlüssel
angelegt. Ein Convex-Deployment-Key gehört nicht in eine Geräteverbindung.
Zusätzliche Auth- oder Backend-Dienste sind nicht erforderlich.

## Verbindung und Speicherung

`@todo/native-client` verwendet diesen plattformneutralen Vertrag:

```ts
interface Connection {
  siteUrl: string;
  apiKey: string;
}
```

`parseConnection(input)` akzeptiert ein JSON-Objekt mit genau diesen Feldern,
wahlweise mit `version: 1`, oder einen lokalen Verbindungslink:

```text
todo://connect#<base64url-kodiertes JSON>
todo://connect#<URL-kodiertes JSON>
```

Der Schlüssel bleibt im Fragment und gehört nicht in eine HTTP-Query oder einen
externen QR-Dienst. Ein QR-Code mit dieser Verbindung enthält den vollständigen
Geräteschlüssel. Die Verbindung nur auf dem vorgesehenen Gerät übernehmen.
`normalizeSiteUrl()` akzeptiert ausschließlich HTTPS-Adressen auf
`<deployment>[.<region>].convex.site`, ohne Zugangsdaten, Port, Pfad, Query oder
Fragment. Ein abschließender Slash wird entfernt. `cloudUrlFromSite()` leitet die
zugehörige `.convex.cloud`-Adresse ab und erhält das Regionssegment.

Das gemeinsame Paket speichert keine Zugangsdaten. Mobile speichert die
Verbindung im nativen sicheren Speicher; Desktop hält sie im Main-Prozess und
verschlüsselt sie mit dem Betriebssystem-Schlüsselbund. Ein Desktop-Renderer
erhält nur die öffentliche Backendadresse und kurzlebige JWTs. Widget-Zugänge
gehören in den gemeinsamen Keychain-Zugriffsbereich beziehungsweise den Android
Keystore, nicht in unverschlüsselte Widget-Snapshots.

## Anmeldung für Live-Daten

```http
POST /auth/device-token
Authorization: Bearer todo_<application-key>
```

Der Aufruf benötigt keinen Body und liefert ohne `data`-Hülle:

```json
{ "token": "<short-lived JWT>", "expiresAt": 1788600300000 }
```

`expiresAt` ist eine UTC-Unixzeit in Millisekunden. Das ES256-JWT gilt höchstens
fünf Minuten und höchstens bis zum Ablauf des Anwendungsschlüssels. Es verwendet
dieselben Issuer-, JWKS- und Audience-Einstellungen wie die Web-App. `sub`
bezeichnet den konfigurierten Owner, `apiKeyId` den verwendeten Geräteschlüssel.
Es enthält kein `sid` für eine Browser-Sitzung.

Jede öffentliche Fachquery und Mutation liest die zugehörige Schlüsselzeile in
derselben Datenbanktransaktion. Ein Widerruf verhindert weitere Befehle und
invalidiert Convex-Abonnements. Eine geplante Mutation markiert einen abgelaufenen
Schlüssel als widerrufen, damit auch bestehende Abonnements neu ausgewertet
werden. Zusätzlich prüft jeder Zugriff das tatsächliche Ablaufdatum. Für bereits
vor dieser Erweiterung angelegte Schlüssel wird die Ablaufplanung beim ersten
Tokenabruf ergänzt.

Die Verwaltung von API-Schlüsseln verlangt weiterhin eine gültige
Browser-Sitzung. Eine Geräteanmeldung kann weder weitere Schlüssel erzeugen noch
andere Schlüssel auflisten oder widerrufen. Widerrufene Geräte verbindet man mit
einem neu erstellten Schlüssel erneut.

```ts
import { createTokenProvider, cloudUrlFromSite } from "@todo/native-client";

const convexUrl = cloudUrlFromSite(connection.siteUrl);
const fetchAccessToken = createTokenProvider(connection);
// Pass fetchAccessToken to the platform's Convex authentication adapter.
await fetchAccessToken({ forceRefreshToken: false });
```

Der Tokenprovider hält das JWT ausschließlich im Arbeitsspeicher, erneuert es
bei weniger als 30 Sekunden Restlaufzeit und bündelt gleichzeitige Abrufe.
`forceRefreshToken: true` erzwingt einen neuen Abruf. Bei HTTP 401 verwirft er das
JWT und liefert `null`; die Plattform entscheidet über die erneute Verbindung.
Netzwerk- und Serverfehler werfen `NativeApiError`. Dabei bleiben `code`, `status`
und gegebenenfalls `requestId` verfügbar, ohne geheime Serverantworten anzuzeigen.
Eine vorübergehende Netzstörung löscht den gespeicherten Geräteschlüssel nicht.

## Habit-Snapshot

```http
GET /api/v1/habits/snapshot
Authorization: Bearer todo_<application-key>
```

```ts
interface HabitSnapshot {
  generatedAt: number;
  localDate: string; // YYYY-MM-DD in the owner's timezone
  timeZone: string; // IANA timezone
  nextResetAt: number;
  habits: {
    id: string;
    title: string;
    completed: boolean;
    occurrenceKey: string;
  }[];
  completedCount: number;
  totalCount: number;
}
```

Die HTTP-Antwort ist `{ data: HabitSnapshot, requestId: string }`.
`fetchHabitSnapshot(connection)` prüft und entpackt sie. Die Methode verwendet
keine Filter. Der Server verarbeitet einen fälligen Tageswechsel vor dem Lesen,
auch wenn der Minutencron noch nicht gelaufen ist. Das führt dieselben geplanten
Archivierungen und Habit-Instanziierungen aus wie die vorhandene Tagesroutine.
Anschließend liefert er ausschließlich Haupt-Habits des aktuellen lokalen Tages.
`nextResetAt` berücksichtigt die Owner-Zeitzone und Sommerzeitwechsel.

Ein gespeicherter Snapshot bleibt eine Momentaufnahme. Nach `nextResetAt` einen
neuen Stand anfordern; alte Instanz-IDs nicht auf den neuen Tag übertragen.
Das Widget kann seinen letzten Stand zeigen, darf ihn bei fehlender Verbindung
aber nicht als frisch geladen ausgeben.

## Abschließen aus einem Widget

```http
POST /api/v1/tasks/<habit-id>/complete
Authorization: Bearer todo_<application-key>
Content-Type: application/json
Idempotency-Key: <persisted-command-id>

{ "occurrenceKey": "2026-09-05" }
```

Dieser Aufruf verwendet die vorhandene Aufgaben-API und deren Transaktion.
Er benötigt kein Convex-JWT. IDs und `occurrenceKey` stammen aus demselben
Snapshot. Der Backendguard verhindert den Abschluss einer vergangenen
Habit-Instanz; Wiederholungen erzeugen keine zweite Erledigung.

```ts
await completeHabit(connection, habit.id, habit.occurrenceKey, savedCommandId);
```

Der optionale vierte Parameter ist die persistierte Idempotenzkennung des
Widget-Befehls. Ohne ihn erzeugt der Client eine neue Kennung. Bei einem
Netzwerkfehler oder HTTP 502, 503 beziehungsweise 504 versucht er denselben
Abschluss einmal erneut, mit unverändertem Body und derselben Kennung. HTTP 401
und 409 werden nicht automatisch wiederholt. Eine unbestätigte Antwort ist kein
erfolgreicher Abschluss. Für Wiederholungen über einen Prozessneustart hinweg
muss die Plattform Kennung, Instanz-ID und Periode gemeinsam speichern.
Die serverseitige Idempotenzquittung gilt sieben Tage.

Ein nativer Widget-Handler muss HTTP selbst aufrufen können, während die Haupt-App
beendet ist. Dafür sind auf iOS ein App Intent und auf Android ein nativer
Receiver beziehungsweise Worker vorgesehen. Ein Listener im laufenden
JavaScript-Prozess allein erfüllt das nicht. Hintergrundaktualisierungen und
Live Activities unterliegen weiterhin den Grenzen des Betriebssystems.

## Prüfung

Die automatisierten Tests prüfen signierte Geräte-JWTs, Owner-Bindung,
Schlüsselwiderruf und Ablauf, die Trennung von Geräte- und Schlüsselverwaltung,
Habit-Abschlüsse samt Idempotenz, Tageswechsel ohne Cron und die 23-Stunden-Nacht
beim Sommerzeitwechsel. Clienttests prüfen Verbindungslinks, sichere Zieladressen,
Token-Caching, Fehlerbehandlung und identische Wiederholungen eines Abschlusses.
Die Tests verwenden isolierte Convex-Daten und keinen Produktionsdatenbestand.
