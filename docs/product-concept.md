# Persönliche Aufgabenverwaltung

Die Umsetzung folgt [AGENT_HANDOFF.md](../AGENT_HANDOFF.md), dem
[Grundkonzept](https://fhpsodb2wtz8.pushdraft.dev/), dem
[technischen Plan](https://7ytivxot1vcv.pushdraft.dev/) und seit Oktober 2026
dem [Listenentwurf](https://5uhhe08pjdkc.pushdraft.dev/). Der Listenentwurf
ersetzt die festen Bereiche `me`, `agency` und `work` und das Projektfeld der
älteren Dokumente. Wo sie sich widersprechen, gilt dieses Dokument.

## Listen

Alles ist eine Liste. Eine Liste hat einen Namen mit 1 bis 80 Zeichen, eine
Farbe, optional ein Emoji und kann Favorit sein. Jeder Besitzer startet mit
me 💌, agency 🪴, work 💻 und Habits 🔁. Weitere Listen wie Urlaub oder ein
Kundenprojekt legt der Nutzer selbst an. Ein Projektfeld gibt es nicht mehr,
ein Projekt ist eine eigene Liste.

Eine normale Liste hat die Abschnitte Tasks und Backlog. Für später sammelt
die Hauptaufgaben beider Abschnitte, die für einen späteren Tag eingeplant
oder zurückgestellt sind. Der Abschnitt erscheint nur, solange es solche
Aufgaben gibt. Zur Wiedervorlage kommt die Aufgabe oben in ihren Block in
Tasks zurück, auch wenn sie vorher im Backlog lag.

Wichtig, Verlauf und Wiederholungen sind feste Listen. Sie zeigen Einträge
aus allen Listen und nehmen selbst keine Aufgaben auf. Sie lassen sich wie
Habits weder umbenennen noch löschen, nur als Favorit an- und abwählen.
Favoriten stehen in der Seitenleiste, in einer Reihenfolge, die der Nutzer
selbst festlegt. Wichtig ist von Anfang an der erste Favorit. Listen legt der
Nutzer in der Listensuche der App an. Dort benennt er sie auch um, ändert
Emoji, Farbe und Favoriten und löscht sie, per Kurzbefehl direkt auf der
markierten Liste, siehe [Desktop](desktop.md#listen).

Die Standardliste nimmt Aufgaben auf, die über die API ohne Liste ankommen.
Sie lässt sich nicht löschen. Andere Listen lassen sich erst löschen, wenn
keine aktuelle Aufgabe und keine Wiederholung mehr auf sie verweist. Heute
erledigte Aufgaben zählen bis zum nächtlichen Aufräumen mit. Auch eine
pausierte Wiederholung hält ihre Liste fest, bis der Nutzer sie löscht.
Erledigungen einer gelöschten Liste bleiben im Verlauf, mit Name und Emoji der
Liste zum Zeitpunkt der Erledigung.

## Aufgaben

Jeder Abschnitt zeigt oben die heute erledigten Aufgaben, darunter die offenen
mit hoher Priorität (‼️) und dann die übrigen offenen, jeweils in manueller
Reihenfolge. Sortieren verschiebt eine Aufgabe nur innerhalb ihres Blocks.
Eine Aufgabe, die neu angelegt, verschoben, wieder geöffnet oder wiedervorgelegt
wird, landet oben in ihrem Block. Ohne hohe Priorität steht sie dann unter
denen mit hoher Priorität.

Neue Aufgaben landen im Abschnitt Tasks. In der App angelegte stehen damit
direkt unter den heute erledigten und den wichtigen. Über die API erfasste
Aufgaben tragen standardmäßig eine Inbox-Markierung, in der App angelegte
nicht. Die App entfernt die Markierung, sobald der Nutzer die Zeile auswählt.
Das Entfernen verändert die Position nicht. Verschieben setzt eine Aufgabe
oben in ihren Block im Abschnitt Tasks der Zielliste und nimmt ihre Subtasks
mit.

Aufgaben haben höchstens eine Ebene von Subtasks. Subtasks erben Liste und
Abschnitt vom Haupttask. Sie haben eigene Titel, Reihenfolge,
KI-Kennzeichnung und Erledigungen. Ihre Erledigung verschiebt oder erledigt
den Haupttask nicht. Ein umfangreicher zusammenhängender Auftrag darf ein Task
sein.

Einrücken macht eine offene Hauptaufgabe zur letzten Subtask der nächsten
offenen Hauptaufgabe darüber im selben Abschnitt. Dabei verliert sie
Planungstag, Frist, Snooze, Wecker, hohe Priorität und Inbox-Markierung, denn
Subtasks haben keine eigenen. Eine Aufgabe mit eigenen Subtasks lässt sich nicht
einrücken, Habits und wiederkehrende Aufgaben auch nicht.
Ausrücken macht eine Subtask wieder zur Hauptaufgabe, direkt hinter ihrem
bisherigen Parent. Wichtig zeigt nur einen Teil jeder Liste. Dort gibt es
deshalb weder Ein- und Ausrücken noch manuelles Sortieren.

Abhaken schreibt sofort einen Erledigungsnachweis mit dem damaligen Titel,
dem Titel des Parents und Name und Emoji der Liste. Erledigte Aufgaben stehen
bis zum nächtlichen Aufräumen oben. Verwerfen erzeugt keine Erledigung.
Bereits bestehende Erledigungen bleiben beim Verwerfen des restlichen
Vorhabens erhalten. Ein bewusst abgeschlossener Parent kann offene Kinder
enthalten. Diese erhalten keinen erfundenen Abschluss und verschwinden beim
Archivieren des Parents aus der Arbeitsansicht.

Wieder öffnen geht nur am lokalen Tag der Erledigung, auch für Habits und
Subtasks. Die Aufgabe ist danach wieder offen und steht oben in ihrem Block
bei der offenen Arbeit. Ihr Erledigungsnachweis wird gelöscht, weil die
Arbeit doch nicht getan ist. Nach dem nächtlichen Aufräumen ist die Aufgabe
archiviert und lässt sich nicht mehr öffnen.

## Termine und Wichtig

Planungstag, verbindliche Frist und Snooze haben getrennte Bedeutung. Ein
Planungstag allein erzeugt keine globale Pflicht. Verbindlich heute fällige
Aufgaben gehören in Wichtig, überfällig sind sie erst am nächsten lokalen Tag.
"Normal einordnen" entfernt die Frist, den Planungstag und die manuelle hohe
Priorität, ohne eine Erledigung zu erzeugen. Ein gesetzter Snooze bleibt
bestehen. Gesnoozte Aufgaben mit manueller hoher Priorität erscheinen erst zur
Wiedervorlage wieder in Wichtig. Eine bereits fällige verbindliche Frist
bleibt auch während eines Snooze sichtbar. Wiedervorlagen sortieren einmalig
oben in ihren Block ein, danach gilt wieder die manuelle Reihenfolge.

Endet ein Snooze, trägt die Aufgabe einen Wecker, bis der Nutzer sie auswählt.
Wie bei der Inbox-Markierung zählt die automatische Auswahl beim Öffnen einer
Liste nicht. Ein neuer Snooze entfernt den Wecker. Eine eingeplante Aufgabe
kommt ohne Wecker zurück, ihr Planungstag steht weiter in der Zeile.

Wichtig sammelt die offenen Hauptaufgaben aller Listen mit hoher Priorität
oder einer Frist bis heute, je Herkunftsliste in einem eigenen Abschnitt.
Heute erledigte stehen durchgestrichen oben in ihrem Abschnitt. Habits
gehören nicht dazu.

## Habits und Wiederholungen

Habits ist eine Liste täglicher Gewohnheiten. Jeder Habit erneuert sich jeden
Tag. Unerledigte Vortage erzeugen weder zusätzliche sichtbare Kopien noch
künstliche Erledigungen. Der einzige Abschnitt heißt Heute und zählt
erledigt und gesamt, etwa `2/5`. Sechs Punkte neben jedem Habit zeigen die
sechs Vortage. Ein Punkt ist nur gefüllt, wenn es an diesem Tag eine echte
Erledigung gibt. Neue Habits entstehen in der Liste Habits, ihre manuelle
Reihenfolge bleibt über den Tageswechsel erhalten.

Kalenderwiederholungen erzeugen höchstens eine offene Aufgabe. Sie können
täglich, an einem Wochentag oder an einem festen Monatstag anstehen. Ein
fehlender Monatstag wird auf den letzten Tag des Monats gelegt. Eine offene
normale Wiederholung bleibt mit ihrer ursprünglichen Frist bestehen. Subtasks
werden nicht automatisch in die nächste Wiederholung übernommen. Die Liste
Wiederholungen zeigt die Vorlagen von Habits und wiederkehrenden Aufgaben nach
Liste gruppiert. Dort lassen sie sich umbenennen, pausieren, fortsetzen und
löschen. Wer einen Habit oder eine wiederkehrende Aufgabe umbenennt, benennt
auch ihre Vorlage um. Löschen verwirft die offene Instanz, ohne eine Erledigung
zu erzeugen. Frühere Erledigungen bleiben im Verlauf.

`Europe/Berlin` ist der Startwert für die Zeitzone. Zeitzone und Standardliste
stehen in beiden Apps unter Einstellungen > Konto und gelten für alle Geräte
und Integrationen.

## Abgrenzung

KI-Aufgaben erhalten eine einfache Kennzeichnung. Aufgaben werden nur auf
ausdrücklichen Wunsch aus Gesprächen abgeleitet. Mögliche inhaltliche Dubletten
erfordern eine Rückfrage, bevor der Agent einen neuen Eintrag anlegt.

Die App setzt für Änderungen Internet voraus. Clients sind der schwebende
macOS-Client und eine [Web-App](web.md) für das iPhone mit derselben
Oberfläche. Die iPhone-App kommt ohne App Store aus. Man fügt sie in Safari zum
Home-Bildschirm hinzu, sie meldet sich wie der Mac über Shoo an und hält einen
eigenen Geräteschlüssel. Auf dem iPhone bearbeitet ein Tipp den Titel einer
Zeile. Langes Drücken öffnet beim Loslassen ihre Aktionen, mit Ziehen sortiert
es um. Der Mac bleibt dabei unverändert. Einen Offline-Modus gibt es auf
keinem Gerät. Die frühere Web-App und die Expo-App für iOS und Android samt
Habit-Widgets wurden am 1. Oktober 2026 entfernt. Anbindungen an
Sprachassistenten stehen noch aus.
