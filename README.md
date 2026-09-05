# todo

Persönliche Aufgabenverwaltung für `me`, `agency` und `work`, mit aktiven Listen,
Backlogs, gemeinsamen wichtigen Aufgaben, täglichen Habits und einer
Erledigungshistorie für die separate Zeitbuchung.

React und TanStack Start bilden die responsive Web-App. Convex speichert und
synchronisiert Aufgaben, führt Tageswechsel aus und stellt eine HTTP-API für
Agenten und Raycast bereit. Shoo übernimmt die Anmeldung. Das Backend erlaubt
nur den ausdrücklich konfigurierten Besitzer.

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

## Dokumentation

- [Produktregeln und dokumentierte Entscheidungen](docs/product-concept.md)
- [Architektur und Sicherheitsgrenzen](docs/architecture.md)
- [HTTP-API und Beispiele](docs/api.md)
- [Entwicklung, Anmeldung und spätere Inbetriebnahme](docs/development.md)
- [Prüfergebnisse und verbleibende Betriebsabnahme](docs/verification.md)
- [Capture-Skill für Aufgaben aus Gesprächen](skills/task-capture/SKILL.md)
- [Vollständiger Planungskontext](AGENT_HANDOFF.md)

Railway ist vorbereitet. Das eigentliche Deployment sowie Glaze, Expo und
konkrete Sprachassistenten-Anbindungen folgen später. Die App setzt eine
Onlineverbindung voraus.

[MIT-Lizenz](LICENSE).
