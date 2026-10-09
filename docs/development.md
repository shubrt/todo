# Entwicklung und Einrichtung

## Lokal prüfen

Node `24.20.0` steht in `.node-version`, pnpm `11.1.1` in `package.json`.
Vite+ verwendet den gepinnten Workspace-Werkzeugsatz. Ein globales älteres
`pnpm` stört nicht, `vp install` wählt die Projektversion.

```sh
vp install
vp run qa
vp run build
vp run dev
```

`dev` startet die Desktop-App, Details stehen in [Desktop](desktop.md). Die
Tests brauchen weder Zugangsdaten noch eine Cloud-Umgebung. Convex-Test
verwendet pro Test einen isolierten Datenbestand und eine steuerbare Uhr.

## Ein ausgewähltes Convex-Backend

Für die Cloud-Einrichtung genau die ausgewählte Umgebung verwenden. Kein
Startscript führt `convex dev` aus, damit nicht nebenbei ein weiterer
Cloud-Datenbestand entsteht.

Die Convex-Konfiguration liegt in `libs/backend/convex.json`. Generierte
Clientreferenzen liegen im Repository. Nach Änderungen an exportierten
Backendfunktionen werden sie aus diesem Paket erzeugt:

```sh
vp run codegen
```

Der Befehl erzeugt lokale Typen und Funktionen und veröffentlicht nichts. Die
Cloud-CLI erzeugt beim späteren Deploy dieselben `.ts`-Dateinamen, weil
`codegen.fileType` ausdrücklich auf `ts` steht. Die lokale Codegenerierung
nutzt die Templates der gepinnten Convex-Version. Nach einem Convex-Update
Generator und erzeugte Dateien gemeinsam prüfen.

## Convex-Befehle und spätere Backend-Updates

Alle Cloud-Befehle laufen vom Repository-Root über den Wrapper:

```sh
node scripts/convex.mjs
node scripts/convex.mjs env list --names-only
node scripts/convex.mjs deploy --typecheck enable
```

Ohne Argument zeigt er die CLI-Hilfe. Vor Arbeitsbefehlen liest er
`CONVEX_SITE_URL` aus `.env` und leitet daraus die `.convex.cloud`-Adresse
desselben Deployments ab. Den `CONVEX_DEPLOY_KEY` liest er aus
`.env.convex-target`. Er unterstützt Produktionsschlüssel mit
`prod:<deployment>|…` und direkte Admin-Schlüssel. Regionale Adressen wie
`https://<deployment>.eu-west-1.convex.site` behalten ihr Regionssegment,
Adressen ohne Region gehen ebenfalls.

Der Wrapper prüft Zugang und Produktionstyp über
`GET /api/v1/deployment_info`, bevor er die Convex-CLI startet. Die Variablen
`CONVEX_SELF_HOSTED_URL` und `CONVEX_SELF_HOSTED_ADMIN_KEY` wählen in der CLI
die geprüfte Adresse direkt aus. Hier zeigen sie auf Convex Cloud und richten
keinen selbst gehosteten Server ein. Konkurrierende Zielvariablen und
Token-Aliase leert der Wrapper im Kindprozess. Zusätzliche Zieloptionen wie
`--url`, `--admin-key`, `--deployment` oder `--env-file` sind gesperrt. Der
gespeicherte Admin-Schlüssel erscheint weder als Prozessargument noch in der
CLI-Ausgabe.

Die CLI arbeitet in `libs/backend`. Relative Dateipfade beziehen sich deshalb
auf dieses Verzeichnis, die Beispiele unten verwenden absolute Pfade vom
Repository-Root. `--from-file` bleibt eine normale Convex-Option zum Import
von Variablen und hat nichts mit dem gesperrten `--env-file` zu tun. Für ein
bereits eingerichtetes Backend genügt der Deploy-Befehl oben. Signierschlüssel
und Besitzerzuordnung bleiben dabei erhalten.

## Erstes Backend-Deployment

Der folgende Ablauf gilt für ein neues Backend. Ein eingerichtetes Backend
nicht wieder auf den Bootstrapzustand zurücksetzen.

1. Im Convex-Dashboard das vorgesehene Projekt und dessen
   Produktionsdeployment auswählen. `.env.example` als `.env` kopieren und
   `CONVEX_SITE_URL` auf die vollständige `.convex.site`-URL setzen,
   einschließlich eines vorhandenen Regionssegments. Einen Deployment-Key
   genau dieses Deployments in der gitignorierten Datei `.env.convex-target`
   als `CONVEX_DEPLOY_KEY=<Wert>` speichern. Dafür einen Editor oder die
   Secret-Verwaltung verwenden, damit der Wert nicht in der Shell-Historie
   steht.
2. Mit `vp run keys:generate` die JWT-Signierschlüssel erzeugen. Das Werkzeug
   schreibt `.env.auth.generated` mit Dateirechten `0600`, überschreibt keine
   vorhandene Datei und gibt keine Schlüssel im Terminal aus. In einer
   separaten gitignorierten Datei `.env.convex-settings` `TODO_OWNER_ID`,
   `AUTH_JWT_PRIVATE_JWK` und `AUTH_JWT_PUBLIC_JWKS` hinterlegen und
   ausdrücklich `AUTH_JWT_ISSUER=''` setzen. `SHOO_OWNER_SUBJECTS` gehört
   nicht in diese Datei. Die Dateien mit
   `chmod 600 .env .env.convex-target .env.convex-settings` auf den Besitzer
   begrenzen.
3. Vom Repository-Root genau dieses Deployment konfigurieren und
   veröffentlichen:

   ```sh
   node scripts/convex.mjs env set --from-file "$PWD/.env.convex-settings"
   node scripts/convex.mjs deploy --typecheck enable
   ```

   Mit ausdrücklich leerem Issuer liefert `auth.config.ts` eine leere
   Providerliste. Fehlt die Variable ganz, lehnt Convex schon das Auswerten
   der Auth-Konfiguration ab. Die Fachfunktionen bleiben geschützt, der
   öffentliche JWKS-Endpunkt ist erreichbar.

4. `https://<deployment>.<region>.convex.site/.well-known/jwks.json` mit der
   exakten Site-URL aus `.env` abrufen. Die Antwort muss HTTP 200 sein und den
   erzeugten öffentlichen `kid` mit `kty: "EC"` und `crv: "P-256"` enthalten.
   Dann `AUTH_JWT_ISSUER` in `.env.convex-settings` auf diese Site-URL ohne
   abschließenden Slash setzen. Dieselbe URL als reinen Text in
   `.cache/jwt-issuer.txt` speichern, den Ordner bei Bedarf mit
   `mkdir -p .cache` anlegen. Vorher den aktuellen Wert prüfen:

   ```sh
   node scripts/convex.mjs env get AUTH_JWT_ISSUER
   ```

   Er muss leer sein oder schon exakt der ausgewählten Site-URL entsprechen.
   Bei einem anderen Wert zuerst die Zielkonfiguration klären. Dann gezielt
   nur den Issuer aktualisieren und den JWT-Provider veröffentlichen:

   ```sh
   node scripts/convex.mjs env set AUTH_JWT_ISSUER --from-file "$PWD/.cache/jwt-issuer.txt"
   node scripts/convex.mjs env set --from-file "$PWD/.env.convex-settings"
   node scripts/convex.mjs deploy --typecheck enable
   ```

   Ein Sammelimport ohne `--force` lehnt geänderte bestehende Werte ab. Der
   Wechsel vom leeren zum aktiven Issuer läuft deshalb als gezieltes Update.
   So wird der Convex-JWT-Provider erst aktiv, wenn seine öffentlichen
   Schlüssel abrufbar sind. Sein `applicationID` beziehungsweise `aud` ist
   `todo`.

5. Die Desktop-App mit `vp run dev` starten und anmelden. Ohne Zuordnung
   antwortet das Backend mit HTTP 403, und die App zeigt den fehlenden
   Eintrag, etwa `{"https://<deployment>.convex.site":"ps_…"}`. Eine
   bestehende Zuordnung zuerst lesen:

   ```sh
   node scripts/convex.mjs env get SHOO_OWNER_SUBJECTS
   ```

   Ist die Variable noch nicht gesetzt, mit `{}` beginnen. Den angezeigten
   Eintrag ergänzen, das Ergebnis als reines JSON in der gitignorierten Datei
   `.cache/shoo-owner-mapping.json` mit Dateirechten `0600` speichern und nur
   diese Variable aktualisieren:

   ```sh
   node scripts/convex.mjs env set SHOO_OWNER_SUBJECTS --from-file "$PWD/.cache/shoo-owner-mapping.json"
   ```

   Danach erneut anmelden. Das Backend liest die Zuordnung bei jeder
   Anmeldung, ein Deploy ist nicht nötig. Weil das Mapping außerhalb der
   Sammelimportdatei liegt, kann ein späterer Import es weder zurücksetzen
   noch an einem älteren lokalen Stand scheitern.

Die Optionen wurden mit der installierten Convex-Version 1.45.0 geprüft.
[Convex-Projektkonfiguration](https://docs.convex.dev/production/project-configuration),
[Convex-Umgebungsvariablen](https://docs.convex.dev/production/environment-variables),
[Deployment-Metadaten](https://docs.convex.dev/deployment-api/get-deployment-info).

## Bestehendes Backend umstellen

Ein Backend aus der Zeit der Web-App braucht nach dem Deploy der neuen
Version nur einen neuen Eintrag in `SHOO_OWNER_SUBJECTS`. Shoo vergibt für die
Convex-Site-Origin ein anderes `sub` als für die alte Web-Origin. Die erste
Anmeldung in der Desktop-App zeigt den Eintrag, Schritt 5 oben beschreibt das
Ergänzen. Einträge für alte Web-Origins liest das Backend nicht mehr.
`APP_ALLOWED_ORIGINS` wird nicht mehr verwendet und kann aus der
Convex-Umgebung entfernt werden. Vorhandene Schlüssel bleiben gültig. Sie
haben kein `kind` und stehen in der App unter Einstellungen > Schlüssel, wo
sich nicht mehr gebrauchte widerrufen lassen.
Die Tabelle `sessions` steht nicht mehr im Schema. Ihre alten Dokumente
blockieren keinen Deploy und lassen sich bei Bedarf im Dashboard löschen.
Noch geplante Jobs `auth:expireSession` laufen bis zu 30 Tage nach dem
Deploy ins Leere und schlagen fehl, weil die Funktion fehlt. Das ist harmlos,
im Dashboard lassen sie sich unter Schedules abbrechen.

## Umstellung auf Listen

Listen ersetzen die festen Bereiche `me`, `agency` und `work` und das
Projektfeld. Stand 9. Oktober 2026 ist diese Version nirgends deployt, das
Produktionsbackend arbeitet noch mit Bereichen. Auch `vp run dev` verbindet
sich mit dem Backend aus `.env`, also mit diesem alten Stand.

Das Schema wird dafür nur erweitert. Neu sind die Tabelle `lists` und
optionale Felder: `listId` und `section` bei Aufgaben, `listId` und `position`
bei Wiederholungen, `listId`, `listNameSnapshot`, `listEmojiSnapshot` und
`recurrenceId` bei Erledigungen sowie `defaultListId` und `listsMigratedAt` in
den Einstellungen. Die alten Felder `area`, `list`, `projectName`,
`defaultArea` und `habitsInitialized` bleiben als optionale Felder im Schema.
Nur der ungenutzte Index `tasks.by_owner_list` fällt weg. Vorhandene Dokumente
passen damit ohne Vorarbeit, der Deploy läuft wie jeder andere über
`node scripts/convex.mjs deploy --typecheck enable`.

Nach dem Deploy stellt `ensureOwner` in `libs/backend/convex/domain.ts` jeden
Besitzer einmal um. Der Minutencron ruft es für alle Besitzer auf, außerdem
jeder Schreibbefehl, `lists.bootstrap` beim Start der App und jeder lesende
Aufruf der HTTP-API. Spätestens eine Minute nach dem Deploy ist die Umstellung
deshalb erledigt, auch ohne geöffnete App. Sie läuft in einer einzigen
Transaktion:

1. Sie legt die sieben Startlisten Wichtig, me, agency, work, Habits, Verlauf
   und Wiederholungen an. Schon vorhandene Listen derselben Art verwendet sie
   wieder.
2. Jede nicht archivierte Hauptaufgabe bekommt `listId` und `section`.
   Archivierte bleiben unverändert, sie erscheinen in keiner Liste mehr. Habits
   kommen in die Liste Habits, andere Aufgaben in die Liste ihres Bereichs,
   ohne Bereich in me. `section` übernimmt den alten Wert von `list`, sonst
   gilt `active`. Subtasks bleiben unverändert, sie erben Liste und Abschnitt
   beim Lesen.
3. Jede Wiederholung bekommt nach derselben Regel eine `listId` und eine
   `position` in der Reihenfolge ihrer Anlage.
4. `defaultListId` zeigt auf die Liste des alten `defaultArea`, ohne Wert auf
   me. Zuletzt setzt sie `listsMigratedAt`.

Danach kostet `ensureOwner` nur noch einen Lesezugriff, ein weiterer Aufruf
ändert nichts. Erledigungen schreibt die Umstellung nicht um. Alte Einträge
behalten `areaSnapshot` und `projectNameSnapshot`. Ihre `listId` leiten
`completions.list` und die API beim Lesen aus dem Bereich ab, Habits gehören
dabei zur Liste Habits. Die Listen me, agency und work tragen `legacyArea`.
Darüber findet das veraltete API-Feld `area` seine Liste auch nach einer
Umbenennung. Convex begrenzt die Zahl der Schreibzugriffe pro Transaktion.
Weil nur nicht archivierte Aufgaben umgestellt werden, bleibt ein persönlicher
Bestand weit darunter.

`projectName` bleibt in den alten Dokumenten stehen, aber kein Code liest oder
schreibt es mehr. Aus Projekten werden keine Listen. Wer ein Projekt als Liste
weiterführen will, legt sie in der App an und verschiebt die Aufgaben mit
`⇧⌘M`. `settings.initializeHabits`, `tasks.summary` und `tasks.projects` gibt
es nicht mehr.

App und Backend gehören zusammen. Eine installierte ältere App ruft
`tasks.summary` und `settings.initializeHabits` auf und funktioniert nach dem
Deploy nicht mehr. Die neue App braucht `lists.bootstrap`. Gegen ein altes
Backend zeigt sie nur einen Fehler und ändert nichts. Deshalb direkt nach dem
Deploy die neue App bauen und installieren. Integrationen über die HTTP-API
laufen weiter, weil die API die alten Felder annimmt, siehe
[Veraltete Felder](api.md#veraltete-felder). Ihre Antworten enthalten `area`,
`list` und `projectName` aber nicht mehr.

Vor dem Deploy im Convex-Dashboard ein Backup anlegen. Nach der Umstellung
führt kein einfacher Deploy zurück zum alten Code. Convex prüft beim Deploy
alle Dokumente gegen das Schema, und das alte Schema kennt `listId` und
`section` nicht. Was nach dem Deploy mit echten Daten zu prüfen ist, steht in
[Verifikation](verification.md).

Das Schema später zu verengen, ist ein eigener, bewusster Schritt mit eigenem
Deploy. Er setzt voraus, dass jeder Besitzer `listsMigratedAt` hat. Vorher muss
eine Migration die alten Felder aus allen Aufgaben, Wiederholungen und
Einstellungen entfernen, sonst lehnt Convex das engere Schema ab. Erst danach
können die Felder aus `schema.ts` und der Code, der sie liest, aus
`domain.ts` verschwinden. `areaSnapshot` und `projectNameSnapshot` alter
Erledigungen bleiben, sie sind Historie. `legacyArea` bleibt, solange die API
das Feld `area` annimmt.

## Konfiguration

`.env` im Repository-Root enthält nur `CONVEX_SITE_URL`. Die Desktop-App
kompiliert den Wert beim Build ein, der Wrapper `scripts/convex.mjs` wählt
damit das Deployment. Die in `.env.example` auskommentierten Backendwerte
gehören in die Convex-Umgebung, ein Eintrag in `.env` richtet dort nichts
ein.

| Convex-Variable        | Inhalt                                              |
| ---------------------- | --------------------------------------------------- |
| `TODO_OWNER_ID`        | Interne Owner-ID, an die alle Daten gebunden sind   |
| `SHOO_OWNER_SUBJECTS`  | JSON-Objekt von Site-Origin auf Shoo-`sub`          |
| `AUTH_JWT_ISSUER`      | Site-URL ohne abschließenden Slash                  |
| `AUTH_JWT_PRIVATE_JWK` | Privater ES256-Schlüssel aus `vp run keys:generate` |
| `AUTH_JWT_PUBLIC_JWKS` | Öffentliche Schlüssel als JWKS, auch für Rotationen |

`CONVEX_SITE_URL` setzt Convex in Funktionen selbst. Daraus leitet das
Backend die Origin für die Shoo-`client_id` und die Redirect-URI
`<site>/auth/desktop/callback` ab. Eine Custom Domain für HTTP Actions würde
diesen Wert und damit das Shoo-`sub` ändern. Die App nimmt derzeit nur
Adressen auf `.convex.site` an. Eine Registrierung bei Shoo oder ein
Client-Secret gibt es nicht. Die Origin in `SHOO_OWNER_SUBJECTS` enthält
Schema und Host, aber keinen Pfad und keinen abschließenden Slash. Bei
direkter Eingabe im Convex-Dashboard JSON-Werte ohne die äußeren
Shell-Anführungszeichen aus der erzeugten Datei übernehmen, beim Import als
`.env`-Datei bleiben sie stehen.

Ohne ausdrückliche Zuordnung weist das Backend auch einen erfolgreichen
fremden Shoo-Login ab. Die Zuordnung ist keine Liste frei behaupteter
E-Mail-Adressen. Geräte- und Integrationsschlüssel gelten bis zu ihrem
Widerruf. Das
Convex-JWT gilt höchstens fünf Minuten und wird mit dem Schlüssel erneuert.
Änderungen am Shoo-Konto widerrufen keinen Schlüssel.

Für eine Signierschlüsselrotation das Werkzeug mit einem anderen Zielpfad
aufrufen, etwa `node scripts/generate-auth-keys.mjs .env.auth.rotation`. Den
neuen öffentlichen Schlüssel zum vorhandenen JWKS hinzufügen. Nach Ablauf des
fünfminütigen JWKS-HTTP-Caches den privaten Signierschlüssel auf den neuen
`kid` umstellen. Den alten öffentlichen Schlüssel noch mindestens zehn
Minuten behalten, damit ausgegebene Tokens und Caches auslaufen. Den privaten
JWK niemals in die App oder in andere Clients übernehmen.

## Logging

Die Backend-Fachfunktionen schreiben strukturierte Convex-Console-Logs. Ein
Log-Stream zu einem externen Dienst ist eine spätere Betriebsentscheidung und
wird hier nicht eingerichtet.
