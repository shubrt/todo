# Entwicklung und Einrichtung

## Lokal prüfen

Node `24.20.0` steht in `.node-version`, pnpm `11.1.1` in `package.json`.
Vite+ verwendet den gepinnten Workspace-Werkzeugsatz. Ein globales älteres
`pnpm` muss nicht verwendet werden; `vp install` wählt die Projektversion.

```sh
vp install
vp run qa
vp run build
vp run dev
```

Portless startet die Web-App unter `https://todo.localhost`. Die lokale
Portless-CA muss auf dem Rechner vertraut sein. Der Devserver übernimmt den
zugewiesenen Port; es gibt keinen festen App-Port. Ohne Portless lässt sich
mit `PORTLESS=0 vp run dev` die reine Web-Oberfläche prüfen. Für Shoo müssen
`APP_ORIGIN`, Callback, Cookie und zugelassene Backend-Origin zusammenpassen.

Ohne Cloud-Konfiguration zeigt die Anwendung die Einrichtung an. Tests
benötigen weder Zugangsdaten noch eine zusätzliche Cloud-Umgebung. Convex-Test
verwendet einen isolierten Datenbestand und eine steuerbare Uhr pro Test.

Am 5. September 2026 wurden das ausgewählte Convex-Produktionsbackend und Shoo
mit der lokalen Web-App geprüft: Deployment mit Node 24, öffentliches JWKS,
Besitzerbindung, Anmeldung, Sitzung, JWT-Ausgabe sowie authentifizierte
Convex-Abfragen und das Schreiben und Lesen der Einstellungen. Der Railway-Betrieb
steht noch aus.

## Ein ausgewähltes Convex-Backend

Verwende für die Cloud-Einrichtung genau die ausgewählte Umgebung. `convex dev` wird von keinem Startscript
ausgeführt, damit nicht nebenbei ein weiterer Cloud-Datenbestand entsteht.

Die Convex-Konfiguration liegt in `libs/backend/convex.json`. Generierte
Clientreferenzen liegen im Repository. Nach Änderungen an exportierten
Backendfunktionen werden sie aus diesem Paket erzeugt:

```sh
vp run codegen
```

Der Befehl erzeugt lokale Typen und Funktionen, er veröffentlicht das Backend
nicht. Die Cloud-CLI erzeugt beim späteren Deploy dieselben `.ts`-Dateinamen;
`codegen.fileType` ist dafür ausdrücklich auf `ts` gesetzt. Die lokale
Codegenerierung nutzt die Templates der gepinnten Convex-Version. Nach einem
Convex-Update werden Generator und erzeugte Dateien gemeinsam geprüft.

## Convex-Befehle und spätere Backend-Updates

Alle Cloud-Befehle laufen vom Repository-Root über den Wrapper:

```sh
node scripts/convex.mjs
node scripts/convex.mjs env list --names-only
node scripts/convex.mjs deploy --typecheck enable
```

Ohne Argument zeigt er die CLI-Hilfe. Vor Arbeitsbefehlen liest er die URLs aus
`.env` und den `CONVEX_DEPLOY_KEY` aus `.env.convex-target`. Er unterstützt
Produktionsschlüssel mit `prod:<deployment>|…` und direkte Admin-Schlüssel.
Regionale Adressen wie `https://<deployment>.eu-west-1.convex.cloud` und
`https://<deployment>.eu-west-1.convex.site` bleiben vollständig erhalten.
Cloud- und Site-URL müssen denselben Deploymentnamen und dieselbe Region haben.
Adressen ohne Regionssegment werden ebenfalls unterstützt.

Der Wrapper prüft den Zugang und den Produktionstyp über
`GET /api/v1/deployment_info`, bevor er die Convex-CLI startet. Die beiden
Variablen `CONVEX_SELF_HOSTED_URL` und `CONVEX_SELF_HOSTED_ADMIN_KEY` wählen
in der CLI die geprüfte Adresse direkt aus. Hier zeigen sie auf Convex Cloud;
sie richten keinen selbst gehosteten Server ein. Konkurrierende Zielvariablen
und Token-Aliase werden im Kindprozess geleert. Zusätzliche Zieloptionen wie
`--url`, `--admin-key`, `--deployment` oder `--env-file` sind gesperrt.
Der gespeicherte Admin-Schlüssel wird weder als Prozessargument übergeben noch
in der CLI-Ausgabe angezeigt.

Die CLI arbeitet in `libs/backend`. Relative Dateipfade beziehen sich deshalb
auf dieses Verzeichnis; die folgenden Beispiele verwenden absolute Dateipfade
vom Repository-Root. `--from-file` bleibt eine normale Convex-Option zum Import
von Variablen und ist vom gesperrten `--env-file` zur Zielauswahl verschieden.
Für ein bereits eingerichtetes Backend genügt der Deploy-Befehl oben.
Signierschlüssel und Besitzerzuordnung bleiben dabei erhalten.

## Erstes Backend-Deployment

Die lokale Web-App und die spätere Railway-App verwenden denselben gewählten
Produktionsdatenbestand. Der folgende Ablauf gilt für ein neues Backend.
Ein eingerichtetes Backend nicht wieder auf den Bootstrapzustand zurücksetzen.

1. Im Convex-Dashboard das vorgesehene Projekt und dessen Produktionsdeployment
   auswählen. Die vollständigen `.convex.cloud`- und `.convex.site`-URLs,
   einschließlich eines vorhandenen Regionssegments, in `.env` speichern.
   Einen Deployment-Key genau dieses Produktionsdeployments in der lokalen,
   gitignorierten Datei `.env.convex-target` als
   `CONVEX_DEPLOY_KEY=<Wert>` speichern. Dafür einen Editor oder die
   Secret-Verwaltung verwenden, damit der Wert nicht in der Shell-Historie steht.
2. Die unten beschriebenen Webvariablen und Auth-Schlüssel vorbereiten. In einer
   separaten gitignorierten Datei `.env.convex-settings` die Backendvariablen
   `APP_ALLOWED_ORIGINS`, `TODO_OWNER_ID`, `AUTH_JWT_PRIVATE_JWK` und
   `AUTH_JWT_PUBLIC_JWKS` hinterlegen. Zusätzlich ausdrücklich
   `AUTH_JWT_ISSUER=''` setzen. `SHOO_OWNER_SUBJECTS` bleibt bis zur bestätigten
   Besitzeridentität aus dieser Importdatei entfernt. Die Dateien mit
   `chmod 600 .env .env.convex-target .env.convex-settings` auf den Besitzer begrenzen.
3. Vom Repository-Root genau dieses Deployment konfigurieren und veröffentlichen:

   ```sh
   node scripts/convex.mjs env set --from-file "$PWD/.env.convex-settings"
   node scripts/convex.mjs deploy --typecheck enable
   ```

   Mit ausdrücklich leerem Issuer liefert `auth.config.ts` eine leere
   Providerliste. Eine fehlende Variable würde Convex bereits beim Auswerten
   der Auth-Konfiguration ablehnen. Die Fachfunktionen bleiben geschützt;
   die Shoo-Identitätsprüfung und der öffentliche JWKS-Endpunkt werden verfügbar.

4. `https://<deployment>.<region>.convex.site/.well-known/jwks.json` lesen;
   dabei die exakte Site-URL aus `.env` verwenden. Die Antwort muss HTTP 200 und
   den erzeugten öffentlichen `kid` mit `kty: "EC"` und `crv: "P-256"` enthalten.
   Anschließend `AUTH_JWT_ISSUER` in `.env.convex-settings` auf diese Site-URL
   ohne abschließenden Slash setzen. Dieselbe URL als reinen Text in
   `.cache/jwt-issuer.txt` speichern; den Ordner bei Bedarf mit `mkdir -p .cache`
   anlegen. Vor der Änderung den aktuellen Wert prüfen:

   ```sh
   node scripts/convex.mjs env get AUTH_JWT_ISSUER
   ```

   Er muss leer sein oder bereits exakt der ausgewählten Site-URL entsprechen.
   Bei einem anderen Wert zuerst die Zielkonfiguration klären. Dann gezielt nur
   den Issuer aktualisieren und den JWT-Provider veröffentlichen:

   ```sh
   node scripts/convex.mjs env set AUTH_JWT_ISSUER --from-file "$PWD/.cache/jwt-issuer.txt"
   node scripts/convex.mjs env set --from-file "$PWD/.env.convex-settings"
   node scripts/convex.mjs deploy --typecheck enable
   ```

   Ein Sammelimport ohne `--force` lehnt geänderte bestehende Werte ab. Daher
   erfolgt der Wechsel vom leeren zum aktiven Issuer als gezieltes Update.
   Damit wird der Convex-JWT-Provider erst aktiviert, wenn seine öffentlichen
   Schlüssel abrufbar sind. Sein `applicationID` beziehungsweise `aud` ist `todo`.

5. Die Web-App starten und die Besitzeridentität wie unten beschrieben prüfen.
   Eine bestehende Zuordnung zuerst lesen und um die neue Origin ergänzen:

   ```sh
   node scripts/convex.mjs env get SHOO_OWNER_SUBJECTS
   ```

   Beim ersten Einrichten ist die Variable noch nicht gesetzt; dann mit `{}`
   beginnen. Die zusammengeführte Zuordnung als reines JSON in der
   gitignorierten Datei `.cache/shoo-owner-mapping.json` mit Dateirechten `0600`
   speichern und genau diese Backendvariable aktualisieren:

   ```sh
   node scripts/convex.mjs env set SHOO_OWNER_SUBJECTS --from-file "$PWD/.cache/shoo-owner-mapping.json"
   ```

   Das Mapping bleibt außerhalb der Sammelimportdatei. Dadurch kann ein späterer
   Import die bestätigte Zuordnung weder zurücksetzen noch wegen eines älteren
   lokalen Mappings abbrechen. Die Anmeldung liest das Mapping unmittelbar;
   ein erneuter Deploy ist dafür nicht nötig. Anschließend über die normale
   Anmeldeschaltfläche anmelden.

Die Optionen wurden mit der installierten Convex-Version 1.45.0 geprüft.
[Convex-Projektkonfiguration](https://docs.convex.dev/production/project-configuration),
[Convex-Umgebungsvariablen](https://docs.convex.dev/production/environment-variables),
[Deployment-Metadaten](https://docs.convex.dev/deployment-api/get-deployment-info).

## Konfiguration

1. `.env.example` als `.env` ins Repository-Root kopieren.
2. `VITE_CONVEX_URL` auf die `.convex.cloud`-URL setzen und `CONVEX_SITE_URL`
   auf die zugehörige `.convex.site`-URL.
3. `APP_ORIGIN` auf die tatsächliche Web-Origin setzen, lokal
   `https://todo.localhost`.
4. Mit `vp run keys:generate` eine neue lokale Schlüsseldatei erzeugen.
   Das Werkzeug überschreibt keine vorhandene Datei und speichert mit
   Dateirechten `0600`. Es schreibt keine Schlüssel ins Terminal.
5. Nur `AUTH_COOKIE_SECRET` aus der erzeugten Datei in die Web-`.env` übernehmen.
   Die privaten und öffentlichen JWT-Schlüssel in der ausgewählten
   Convex-Umgebung setzen, zusammen mit `AUTH_JWT_ISSUER`,
   `APP_ALLOWED_ORIGINS` und `TODO_OWNER_ID`.
6. Nach Einrichtung der Backend-Auth-Endpunkte
   `https://todo.localhost/api/auth/identity` öffnen und bei Shoo anmelden.
   Dieser reine Identitätscheck zeigt die verifizierte Origin und das Subject.
   Er erzeugt weder eine Sitzung noch Zugriffsrechte. Die angezeigte Zuordnung
   als `SHOO_OWNER_SUBJECTS` im Backend hinterlegen. Für die Produktions-Origin
   denselben Vorgang dort wiederholen und die Zuordnung ergänzen.

Origins enthalten Schema und gegebenenfalls Port, aber keinen Pfad und keinen
abschließenden Slash. `APP_ALLOWED_ORIGINS` ist eine durch Kommas getrennte Liste;
`SHOO_OWNER_SUBJECTS` ist ein JSON-Objekt. Bei direkter Eingabe im Convex-Dashboard
werden JSON-Werte ohne die äußeren Shell-Anführungszeichen aus der erzeugten
Datei übernommen. Beim Import als `.env`-Datei bleiben diese Anführungszeichen
stehen. Die `client_id` für Shoo wird aus der Web-Origin als
`origin:https://todo.localhost` abgeleitet; die Redirect-URI ist exakt
`https://todo.localhost/api/auth/callback`. Es gibt keinen zusätzlich erforderlichen
Shoo-Client-Secret in dieser PKCE-Integration.

Der lokale Vite-Server und `vp run start` lesen die `.env` aus dem Repository-Root.
Nach Änderungen der Webvariablen den Server neu starten. Die dort auskommentierten
Backendwerte richten Convex nicht ein. `AUTH_JWT_ISSUER` bleibt für lokale und
produktive Web-Origin die gemeinsame Convex-Site-URL.

`TODO_OWNER_ID` bleibt über alle Origins gleich. `SHOO_OWNER_SUBJECTS` ordnet
die jeweils verifizierten originabhängigen Shoo-Subjects diesem Owner zu.
Ohne ausdrückliche Zuordnung wird auch ein erfolgreicher fremder Shoo-Login
abgewiesen. Die Zuordnung ist keine Liste von frei behaupteten E-Mail-Adressen.

Die App-Sitzung gilt bis zu 30 Tage. Das Convex-JWT gilt höchstens fünf Minuten
und wird über die gültige Sitzung erneuert. Logout widerruft die Sitzung.
Die App-Sitzung ist eigenständig; Änderungen am Shoo-Konto widerrufen sie nicht
automatisch. API-Schlüssel werden nach der Anmeldung in den Einstellungen erzeugt.

Für eine Signierschlüsselrotation das Werkzeug mit einem anderen Zielpfad
aufrufen, etwa `node scripts/generate-auth-keys.mjs .env.auth.rotation`.
Den neuen öffentlichen Schlüssel zum vorhandenen JWKS hinzufügen. Nach Ablauf
des fünfminütigen JWKS-HTTP-Caches den privaten Signierschlüssel auf den neuen
`kid` umstellen. Den alten öffentlichen Schlüssel noch mindestens zehn Minuten
behalten, damit ausgegebene Tokens und Caches auslaufen können.
`AUTH_COOKIE_SECRET` bei dieser Signierschlüsselrotation beibehalten; die neu
erzeugte Datei enthält ebenfalls einen Cookie-Schlüssel, der dafür nicht gebraucht
wird. Niemals den privaten JWK im Browser verwenden.

## Logging

Console-Logging ist ohne Zusatzdienst verfügbar. Für Webserver-Ereignisse
optional `AXIOM_DATASET` und `AXIOM_TOKEN` setzen. Die Backend-Fachfunktionen
verwenden weiterhin Convex-Console-Logs. Ein nativer Axiom-Log-Stream ist eine
spätere Betriebsentscheidung; er wird hier nicht automatisch eingerichtet.

## Späterer Railway-Betrieb

`railway.json` bereitet den Node-Build und `/api/health` als Prozessprüfung vor.
Es gibt keinen Datenbank-Migrations- oder automatischen Convex-Deploy-Schritt.
Beim später freigegebenen Deployment müssen die Webvariablen und die
Produktions-Origin konfiguriert werden. `VITE_CONVEX_URL` ist eine Buildvariable;
eine Änderung erfordert einen neuen Webbuild.

Den Railway-Dienst mit dem Repository-Root als Arbeitsverzeichnis verbinden,
damit Workspace-Pakete, Lockfile und `railway.json` verfügbar sind. Die vier
Webvariablen `VITE_CONVEX_URL`, `CONVEX_SITE_URL`, `APP_ORIGIN` und
`AUTH_COOKIE_SECRET` als Railway-Variablen setzen. Nitro verwendet den von Railway
bereitgestellten `PORT`. Den endgültigen HTTPS-Domainnamen vor der Shoo-Anmeldung
in `APP_ORIGIN` und im Backend in `APP_ALLOWED_ORIGINS` eintragen. Für die neue
Origin den Identitätscheck wiederholen und deren Subject zum bestehenden Mapping
ergänzen. Der Webprozess braucht weder `CONVEX_DEPLOY_KEY` noch den privaten
JWT-Signierschlüssel.

Die Healthroute prüft den Webprozess. Sie bestätigt keine funktionierende
Shoo-Anmeldung oder Convex-Verbindung. Nach der Inbetriebnahme gehören eine
echte Anmeldung, Token-Erneuerung, Logout und eine Änderung mit zwei geöffneten
Clients zur Betriebsabnahme.
