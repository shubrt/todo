# todo

Persönliche Aufgabenverwaltung für `me`, `agency` und `work`, mit aktiven Listen,
Backlogs, gemeinsamen wichtigen Aufgaben, täglichen Habits und einer
Erledigungshistorie für die separate Zeitbuchung.

React und TanStack Start bilden die responsive Web-App. Convex speichert und
synchronisiert Aufgaben, führt Tageswechsel aus und stellt eine HTTP-API für
Agenten und Raycast bereit. Shoo übernimmt die Anmeldung. Das Backend erlaubt
nur den ausdrücklich konfigurierten Besitzer.

Die Expo-App für iOS und Android ergänzt Habit-Widgets, iOS Live Activities
und eine laufende Android-Benachrichtigung. Der macOS-Client zeigt dieselben
Aufgaben in einem kompakten Fenster über anderen Apps an.

## Starten

Node `24.20.0` und [Vite+](https://viteplus.dev/) verwenden. Die pnpm-Version
und Paketversionen sind im Workspace festgelegt.

```sh
vp install
vp run dev
```

Die Web-App läuft unter `https://todo.localhost` über Portless. Ohne
konfiguriertes Backend erscheint eine Einrichtungsansicht. Für die Verbindung
`.env.example` nach `.env` kopieren und der [Einrichtungsanleitung](docs/development.md)
folgen. Es wird kein Cloudprojekt automatisch angelegt oder veröffentlicht.

## Prüfen

```sh
vp run codegen
vp run qa
vp run build
```

`qa` umfasst Formatierung, Lint, Workspace-Regeln, TypeScript und isolierte
Verhaltenstests. Die Tests verwenden keine persönlichen Cloud-Daten.
Der Produktionsbuild liegt unter `apps/web/.output/` und lässt sich mit
`vp run start` ausführen.

## Native Apps

```sh
vp run @todo/desktop#dev
vp run @todo/desktop#package
vp run @todo/mobile#dev
vp run @todo/mobile#build
vp run @todo/mobile#prebuild
```

Das macOS-Paket entsteht unter `apps/desktop/release/`. Der mobile `build`
erzeugt die JavaScript-Bundles; Installation mit Widgets erfordert zusätzlich
einen nativen Build. In den Web-Einstellungen einen eigenen Schlüssel pro
Gerät erstellen und die ausgegebenen Verbindungsdaten in die App kopieren.

## Dokumentation

- [Produktregeln und dokumentierte Entscheidungen](docs/product-concept.md)
- [Architektur und Sicherheitsgrenzen](docs/architecture.md)
- [HTTP-API und Beispiele](docs/api.md)
- [macOS-Fenster und Tastaturbedienung](docs/desktop.md)
- [Mobile App, Installation und Expo-Builds](apps/mobile/README.md)
- [Habits auf Homescreen und Sperrbildschirm](docs/habit-surfaces.md)
- [Geräteanmeldung und Widget-API](docs/native-api.md)
- [Entwicklung, Anmeldung und spätere Inbetriebnahme](docs/development.md)
- [Prüfergebnisse und verbleibende Betriebsabnahme](docs/verification.md)
- [Capture-Skill für Aufgaben aus Gesprächen](skills/task-capture/SKILL.md)
- [Vollständiger Planungskontext](AGENT_HANDOFF.md)

Railway ist vorbereitet; ein öffentliches Web-Deployment und konkrete
Sprachassistenten-Anbindungen stehen noch aus. Alle Clients verwenden
dasselbe Convex-Backend. Aufgabenänderungen setzen eine Onlineverbindung voraus.

[MIT-Lizenz](LICENSE).
