# Verifikation

Geprüft am 5. September 2026 mit Node `24.20.0`, dem gepinnten pnpm-Workspace
und Vite+.

## Automatisierte Prüfungen

`vp run qa` prüft Formatierung, Lint, Workspace-Konventionen, sämtliche
TypeScript-Pakete und die Verhaltenstests. Der aktuelle Stand umfasst 50
erfolgreiche Tests:

| Testbestand           | Anzahl | Geprüftes Verhalten                                                                                                                                                                            |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend-Fachlogik     | 19     | Erfassung, Inbox ohne Positionswechsel, zwei Ebenen, Sortierung, manuelle Parent-Abschlüsse, unveränderliche Historie, Archivierung, Fristen, Snooze, DST, Wiederholungen, Habits und Aufholen |
| Backend-Auth und HTTP | 15     | Shoo-Signatur, Issuer, Audience, Ablauf, Besitzerzuordnung, Codeaustausch, Session-Hashes, Token-Ausstellung, Widerruf, atomare Idempotenz, Pagination, Größenlimits und gemeinsame Fachregeln |
| Web-Auth              | 8      | PKCE/State, Cookie-Eigenschaften, CSRF, Einrichtungszustand, Identitätscheck ohne Sitzung sowie Logout bei Fehlern                                                                             |
| Web-Bedienung         | 7      | Entwurf nach fehlgeschlagenem Capture, kein falscher Abschluss, keine Offline-Mutation, Inbox ohne Umsortieren, unabhängiger Subtask-Abschluss, Loginfehler und ungültige Verlaufszeiträume    |
| Logging               | 1      | Keine Bodies, Aufgabentitel oder Zugangsdaten in strukturierten Ereignissen                                                                                                                    |

Backendtests laufen mit `convex-test`, einer kontrollierten Uhr und isolierten
Daten. Die Auth-/HTTP-Tests laufen in der Edge-Testumgebung, Web-Auth in Node
und UI-Tests in Happy DOM. Shoo-Netzwerkantworten werden für diese Tests durch
kontrollierte Antworten mit lokal signierten Prüftokens ersetzt.

`vp run codegen` erzeugt die Convex-Referenzen ohne Cloud-Zugang.
`vp run build` erzeugt erfolgreich Client, SSR und Nitro-Node-Server. Der
Schlüsselgenerator wurde auf zusammengehörige EC-Schlüssel, ein ausschließlich
öffentliches JWKS und Dateirechte `0600` geprüft. Der Capture-Skill besteht
die Skill-Validierung.

## Browser und Node-Server

Die tatsächliche Web-App wurde unter der Portless-Adresse
`https://todo.localhost` auf Desktopbreite und mit `390 × 844` Pixeln geprüft.
Die Einrichtungsansicht rendert ohne JavaScript-Fehler und ohne horizontalen
Überlauf. Texte und Bedienelemente wurden nach der ersten Prüfung vergrößert
und kontrastreicher gestaltet.

Eine getrennte, temporäre Testansicht der angemeldeten Oberfläche wurde mit
dem ursprünglichen Vorhaben „Zeitbuchung umstellen“, ausgeklappten Subtasks
und einem zusammenhängenden Bynder-Auftrag visuell geprüft. Diese Darstellung
stammt aus Testdaten und wurde nicht als Demo-Modus in die Anwendung eingebaut.
Auch sie hat auf Desktop und Handy keinen horizontalen Überlauf.

Der gebaute Node-Server wurde lokal gestartet. `/api/health`, die
Einrichtungsantwort von `/api/auth/session`, das SSR-Dokument, UTF-8 und die
Asset-Verweise wurden geprüft.

## Noch ausstehende Betriebsabnahme

Es wurden kein Convex-Cloudprojekt, keine produktive Shoo-Zuordnung und kein
Railway-Dienst eingerichtet. Deshalb sind folgende Prüfungen erst nach der
[Einrichtung](development.md) mit echten Zugangsdaten möglich:

- Shoo-Login aus der tatsächlichen lokalen und produktiven Origin.
- Convex-Verifikation des eigenen JWT über das veröffentlichte JWKS.
- Token-Erneuerung und Entzug einer laufenden Websitzung im echten Dienst.
- Eine API-Änderung bei zwei gleichzeitig geöffneten, angemeldeten Webclients.
- Zeitübergänge und optionale Axiom-Weiterleitung in der gewählten Cloud-Umgebung.

Die Tests prüfen die dafür implementierten Regeln. Sie ersetzen diese
Betriebsabnahme nicht. Die Reihenfolge für genau ein Produktionsbackend steht
in der Einrichtungsanleitung.
