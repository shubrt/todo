# Verifikation

## Automatisierte Prüfungen

`vp run qa` prüft Formatierung, Lint einschließlich Typanalyse,
Workspace-Konventionen, alle TypeScript-Pakete und die Verhaltenstests.

| Testbestand              | Geprüftes Verhalten                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                  | Aufgabenregeln, Wiederholungen, DST/Tageswechsel, Shoo-Tokenprüfung, Desktop-Callback, Codetausch und Besitzerzuordnung, Geräte- und Integrationsschlüssel, Schlüsselliste und -widerruf, Grenze von 30 aktiven Schlüsseln, HTTP-Idempotenz, Geräte-JWTs, 403 für Integrationsschlüssel an `/auth/device-token`, aktuelle Habit-Snapshots |
| Gemeinsamer Geräteclient | Gespeicherte Verbindungsdaten samt Region, Gerätelogin mit Schlüsselart und Widerruf, Token-Erneuerung, gebündelte Abrufe und Fehler                                                                                                                                                                                                      |
| Desktop                  | Loopback-Anmeldung mit PKCE, State, Abbruch und Zeitüberschreitung, nur eine Shoo-Anmeldung zur Zeit, Vertrauensgrenzen für IPC, Monitorwechsel, verschlüsselte Speicherung, fehlgeschlagene UI-Aktionen, Provider-Cleanup, Einstellungen mit neuem Integrationsschlüssel, Widerruf, Standardbereich und Zeitzone, Wiederholungsansicht   |
| Logging                  | Keine Bodies, Aufgabentitel oder Zugangsdaten in strukturierten Ereignissen                                                                                                                                                                                                                                                               |

Fachtests verwenden isolierte Daten und eine kontrollierte Uhr. Sie verändern
keine persönlichen Aufgaben im Produktivbackend.

## Anmeldung aus der Desktop-App

Der Login über Shoo in der Desktop-App ist bisher nur automatisiert getestet.
Einstellungen, Schlüsselliste und Wiederholungsansicht liefen nur gegen ein
nachgebildetes Convex. Gegen das echte Deployment stehen aus:

- Deploy der neuen Endpunkte unter `/auth` und Eintrag der Site-Origin in `SHOO_OWNER_SUBJECTS`.
- Erste Anmeldung mit HTTP 403 und angezeigtem Mapping, danach erfolgreiche Anmeldung.
- Tokenerneuerung über `/auth/device-token` und Widerruf über "Verbindung entfernen".
- Integrationsschlüssel mit echter Shoo-Bestätigung erzeugen, damit `/api/v1` aufrufen, an `/auth/device-token` HTTP 403 erhalten und ihn in der Liste widerrufen.
- Standardbereich und Zeitzone ändern und das Ergebnis über die API prüfen.
- Eine Wiederholung umbenennen, pausieren und fortsetzen.

## Stand 5. September 2026

Damals lief noch die inzwischen entfernte Web-App. Gegen das
Convex-Produktionsdeployment ergaben reale Prüfungen:

- `/auth/device-token`: HTTP 200, fünf Minuten Laufzeit, `apiKeyId` im JWT.
- `/api/v1/habits/snapshot`: HTTP 200, fünf vorhandene Habits mit dem aktuellen `occurrenceKey`.
- Web-App und macOS-Client lasen gleichzeitig denselben Datenbestand.

Das arm64-Paket wurde gebaut und als echte Electron-App gestartet. Nach dem
Verbindungsdialog, nach lokaler Abmeldung und nach erneuter Verbindung waren
alle sechs Ansichten und die Einstellungen ohne Renderer- oder Konsolenfehler
und ohne horizontalen Überlauf. Native Laufzeitprüfungen bestätigten das
sichtbare Fenster, `alwaysOnTop`, alle Schreibtische, den registrierten
globalen Kurzbefehl, die Renderer-Sandbox, den isolierten Preload und die
deaktivierte Node-Integration. Der macOS-Schlüsselbund war verfügbar, und
`connection.enc` enthielt den Geräteschlüssel nicht im Klartext.

## Weitere Betriebsarbeit

Die App ist nicht mit einer Apple Developer ID signiert oder notarisiert.
Manuelles Wechseln zwischen mehreren Spaces und fremden Vollbild-Apps gehört
zur persönlichen Betriebsabnahme. Die nativen Fensteroptionen dafür sind
gesetzt und geprüft.
