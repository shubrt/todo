# todo

Persönliche Aufgabenverwaltung für `me`, `agency` und `work`, mit aktiven Listen,
Backlogs, gemeinsamen wichtigen Aufgaben, täglichen Habits und einer
Erledigungshistorie für die separate Zeitbuchung.

Der einzige Client ist eine Electron-App für macOS, ein kleines schwebendes
Fenster über anderen Apps. Convex speichert und synchronisiert die Aufgaben,
führt Tageswechsel aus und stellt eine HTTP-API für Agenten und Raycast bereit.
Angemeldet wird über Shoo im Browser. Das Backend lässt nur den ausdrücklich
konfigurierten Besitzer zu.

## Starten

Node `24.20.0` und [Vite+](https://viteplus.dev/) verwenden. Die pnpm-Version
und Paketversionen sind im Workspace festgelegt.

```sh
vp install
cp .env.example .env
vp run dev
```

In `.env` gehört nur `CONVEX_SITE_URL`. Der Build kompiliert den Wert in die
App, ohne ihn schlägt die Anmeldung fehl. `dev` startet pro Worktree eine
eigene Variante der App. Vor dem Löschen eines Worktrees in seiner Variante
"Verbindung entfernen" wählen. Einen vergessenen Geräteschlüssel widerruft
man später unter Einstellungen > Schlüssel, siehe
[Desktop](docs/desktop.md#schlüssel). Wie das Backend
eingerichtet wird, steht in [Entwicklung](docs/development.md). Kein Befehl
legt automatisch ein Cloudprojekt an oder veröffentlicht etwas.

## Prüfen und bauen

```sh
vp run codegen
vp run qa
vp run build
vp run package
```

`qa` umfasst Formatierung, Lint, Workspace-Regeln, TypeScript und isolierte
Verhaltenstests. Die Tests verwenden keine persönlichen Cloud-Daten. `package`
legt die unsignierte macOS-App unter `apps/desktop/release/` ab.

## Dokumentation

- [Produktregeln und dokumentierte Entscheidungen](docs/product-concept.md)
- [Architektur und Sicherheitsgrenzen](docs/architecture.md)
- [macOS-App, Anmeldung, Schlüssel und Bedienung](docs/desktop.md)
- [HTTP-API und Beispiele](docs/api.md)
- [Entwicklung und Backend-Einrichtung](docs/development.md)
- [Prüfergebnisse und offene Betriebsabnahme](docs/verification.md)
- [Capture-Skill für Aufgaben aus Gesprächen](skills/task-capture/SKILL.md)
- [Ursprünglicher Planungskontext](AGENT_HANDOFF.md)

Aufgabenänderungen setzen eine Onlineverbindung voraus. Schlüssel für
Integrationen wie den Capture-Skill erzeugt die App unter Einstellungen >
Schlüssel nach einer erneuten Shoo-Anmeldung. Sie gelten nur für die
[HTTP-API](docs/api.md).

[MIT-Lizenz](LICENSE).
