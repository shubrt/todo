# todo

Monorepo-Gerüst für [shubrt/todo](https://github.com/shubrt/todo).
Anwendungscode ist noch nicht enthalten.

- `apps/`: Platz für Anwendungen.
- `libs/`: Platz für gemeinsam genutzte Bibliotheken.
- `tools/typescript/`: TypeScript-Basiskonfigurationen als `@todo/tsconfig`.

Voraussetzungen: Node.js ab Version 22.12 und [Vite+](https://viteplus.dev) mit `vp`.
Die pnpm-Version ist in `package.json` festgelegt.

```bash
vp install
vp run qa
```

`qa` prüft Formatierung, Lint-Regeln, Workspace-Konfiguration und TypeScript
und führt vorhandene Tests aus. Tests gehören nach `apps/*/test/` oder
`libs/*/test/`. Solange keine Tests vorhanden sind, endet der Testlauf erfolgreich.

Die Installation richtet die Git-Hooks für Prüfungen vor dem Commit und
Commit-Nachrichten nach Conventional Commits ein.

Das Projekt steht unter der [MIT-Lizenz](LICENSE).
