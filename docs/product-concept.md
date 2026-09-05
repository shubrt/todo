# Persönliche Aufgabenverwaltung

Die Umsetzung folgt [AGENT_HANDOFF.md](../AGENT_HANDOFF.md), dem
[Grundkonzept](https://fhpsodb2wtz8.pushdraft.dev/) und dem
[technischen Plan](https://7ytivxot1vcv.pushdraft.dev/).

`me`, `agency` und `work` haben jeweils eine aktive Liste und einen Backlog.
"Wichtig" zeigt unbedingt anstehende Haupttasks aller drei Bereiche. Habits
bilden eine eigene tägliche Liste. Die Historie zeigt tatsächlich erledigte
Arbeit nach lokalem Tag und dient als Grundlage für die separate Zeitbuchung.

Neue Aufgaben landen oben bei der offenen Arbeit in der aktiven Liste, zunächst
mit Inbox-Markierung. Der heutige erledigte Block bleibt darüber sichtbar.
Ein fehlender Bereich verwendet die persönliche Standardeinstellung. Das
Entfernen der Markierung verändert die Position nicht. Bei agency und work
gehört der Projektname zum verständlichen Kontext; für schnelle Erfassung darf
er zunächst fehlen.

Aufgaben haben höchstens eine Ebene von Subtasks. Subtasks erben Bereich,
Projekt und Liste vom Haupttask. Sie haben eigene Titel, Reihenfolge,
KI-Kennzeichnung und Erledigungen. Ihre Erledigung verschiebt oder erledigt den
Haupttask nicht. Ein umfangreicher zusammenhängender Auftrag darf ein Task sein.

Abhaken schreibt sofort einen Erledigungsnachweis mit den damaligen Titeln und
Zuordnungen. Erledigte Aufgaben stehen bis zum nächtlichen Aufräumen oben.
Verwerfen erzeugt keine Erledigung. Bereits bestehende Erledigungen bleiben
beim Verwerfen des restlichen Vorhabens erhalten. Ein bewusst abgeschlossener
Parent kann offene Kinder enthalten; diese erhalten keinen erfundenen Abschluss
und verschwinden beim Archivieren des Parents aus der Arbeitsansicht.

Planungstag, verbindliche Frist und Snooze haben getrennte Bedeutung. Ein
Planungstag allein erzeugt keine globale Pflicht. Verbindlich heute fällige
Aufgaben gehören in "Wichtig", überfällig sind sie erst am nächsten lokalen Tag.
"Normal behandeln" entfernt die Frist, den Planungstag und die manuelle hohe
Priorität, ohne eine Erledigung zu erzeugen. Ein gesetzter Snooze bleibt bestehen.
Gesnoozte Aufgaben mit manueller hoher Priorität erscheinen erst zur Wiedervorlage
wieder in "Wichtig". Eine bereits fällige verbindliche Frist bleibt auch während
eines Snooze sichtbar. Wiedervorlagen sortieren einmalig oben ein; danach gilt
wieder die manuelle Reihenfolge.

Kalenderwiederholungen erzeugen höchstens eine offene Aufgabe. Habits stehen
täglich bereit. Die fünf ersten Habit-Namen legt der Nutzer selbst fest, weil
im Konzept keine konkreten Namen genannt wurden. Weitere Habits sind möglich.
`Europe/Berlin` ist der änderbare Startwert für die Zeitzone.

Wiederholungen können täglich, an einem Wochentag oder an einem festen Monatstag
anstehen. Ein fehlender Monatstag wird auf den letzten Tag des Monats gelegt.
Eine offene normale Wiederholung bleibt mit ihrer ursprünglichen Frist bestehen.
Subtasks werden nicht automatisch in die nächste Wiederholung übernommen.
Bei Habits wird der heutige Eintrag täglich erneuert; unerledigte Vortage erzeugen
weder zusätzliche sichtbare Kopien noch künstliche Erledigungen.

KI-Aufgaben erhalten eine einfache Kennzeichnung. Aufgaben werden nur auf
ausdrücklichen Wunsch aus Gesprächen abgeleitet. Mögliche inhaltliche Dubletten
erfordern eine Rückfrage, bevor der Agent einen neuen Eintrag anlegt.

Die App setzt für Änderungen Internet voraus. Expo für iOS/Android und ein
schwebender macOS-Client ergänzen inzwischen die Web-App. Habit-Widgets und
Live-Anzeigen verwenden denselben Datenbestand. Geräteassistenten und ein
APNs-Push-Dienst stehen noch aus. Ein Wiederöffnen bereits
erledigter Arbeit ist noch nicht definiert und deshalb nicht Teil dieser Fassung.
