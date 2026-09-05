# Agentenübergabe: persönliche Aufgabenverwaltung

Stand: 5. September 2026. Dieses Dokument enthält den fachlichen und technischen Kontext des gesamten Planungsgesprächs. Es soll einem anderen Agenten ermöglichen, das Projekt umzusetzen, ohne die grundlegenden Anforderungen erneut erheben zu müssen.

Schnelleinstieg: [Produktregeln](#4-verbindliche-produktregeln), [Architektur](#9-empfohlene-zielarchitektur), [Datenmodell](#10-datenmodell-konkreter-umsetzungsvorschlag), [Shoo und Convex](#12-anmeldung-mit-shoo-und-zugriff-auf-convex), [externe API](#13-externe-api-für-agenten-raycast-und-weitere-eingänge), [Umsetzungsphasen](#18-umsetzungsphasen-und-überprüfbare-ergebnisse), [Prüffälle](#19-verifikation-konkrete-verhaltenstests), [offene Details](#20-offene-details-und-empfohlene-standardentscheidungen), [Startanweisung](#23-startanweisung-für-den-umsetzenden-agenten).

## 0. Zuerst lesen: Verbindlichkeit, Status und Auftrag

### Was bereits existiert

- Ein gemeinsam mit dem Nutzer abgestimmtes fachliches Grundkonzept.
- Das veröffentlichte [Grundkonzept als HTML](https://fhpsodb2wtz8.pushdraft.dev).
- Der veröffentlichte [technische Umsetzungsplan als HTML](https://7ytivxot1vcv.pushdraft.dev).
- Dieses Markdown-Handoff als ausführliche, eigenständig verständliche Übergabe.
- Eine read-only Untersuchung der Referenzprojekte und einschlägiger aktueller Primärdokumentation.

Die HTML-Veröffentlichungen wurden vom Upload-Werkzeug erfolgreich bestätigt. Es fand keine anschließende Browserprüfung statt. Ihre temporären lokalen HTML-Dateien wurden nach erfolgreichem Upload entfernt.

### Was noch nicht existiert

Es wurde noch keine neue Aufgaben-App implementiert. Es wurden für dieses Projekt kein neues GitHub-Repository, kein Convex-Projekt, kein Railway-Dienst, keine Shoo-Konfiguration und keine Anwendungsschlüssel angelegt. Es gibt keine getestete End-to-End-Implementierung der hier vorgeschlagenen Architektur. Die Referenzprojekte wurden nicht verändert.

Der bisherige Workspace ist ein Skills-Repository. Er ist lediglich der Ablageort dieses Dokuments und nicht bereits das neue App-Repository. Die neue Anwendung gehört in ein eigenes Projekt nach dem Vorbild von Pushdraft.

### Wie Aussagen in diesem Dokument zu lesen sind

1. **Bestätigte Vorgabe:** vom Nutzer ausdrücklich genannt oder in der Gesamtsynthese bestätigt. Diese Regeln umsetzen und nicht ohne Anlass erneut zur Diskussion stellen.
2. **Referenzbefund:** im Gespräch im Quellcode oder in Dokumentation festgestellt. Vor Verwendung konkreter Paket-APIs und Versionen den tatsächlichen Stand prüfen.
3. **Umsetzungsempfehlung:** eine konkrete Lösung, die dieses Handoff für die Implementierung vorschlägt. Sie ist keine zusätzlich vom Nutzer verabschiedete Produktanforderung.
4. **Nicht festgelegter Randfall:** kein Grund, die gesamte Arbeit zu blockieren. Wo unten eine plausible Standardentscheidung angegeben ist, kann sie als dokumentierte Umsetzungsempfehlung verwendet werden. Bei einem echten Konflikt mit einer bestätigten Vorgabe gezielt nachfragen.

Die jüngste Nutzerkorrektur hat Vorrang vor älteren Vorschlägen. Besonders wichtig sind die ausdrückliche Rücknahme von Offline, der Verzicht auf eine zusätzliche KI-Ansicht und der einzelne Produktionsstrang.

Der aktuelle Gesprächsauftrag war, zuerst den HTML-Plan und danach dieses ausführliche Markdown zu erstellen. Ein anderer Agent soll darauf aufbauend die App umsetzen können. **Ein produktives Deployment bleibt ausdrücklich ein späterer Schritt.** Das Handoff selbst ist keine Freigabe, Dienste zu veröffentlichen, kostenpflichtige Pläne zu buchen oder Produktivdaten umzubauen.

## 1. Person, Motivation und Arbeitsalltag

Der Nutzer organisiert drei Lebensbereiche:

- **me:** Privatleben, Haushalt, Freunde, Urlaub, persönliche Entwicklung und ähnliche Themen.
- **agency:** seine eigene wachsende Softwarefirma, einschließlich Softwareentwicklung.
- **work:** sein angestellter Tagesjob als Software Architect.

Aktuell verwendet er Markdown-Checklisten in Raycast Notes. Neue Einträge sind dort mühsam zu erfassen; abgeschlossene Aufgaben werden abgehakt, nach oben verschoben und einmal täglich aus der sichtbaren Liste entfernt.

Die wichtigsten Probleme:

1. Es fehlt ein verlässlicher Rückblick darüber, welche Aufgaben an welchem Tag erledigt wurden. Genau diesen Rückblick benötigt das separate Zeitbuchungssystem.
2. Das Erfassen neuer Aufgaben verursacht zu viel Aufwand, besonders unterwegs oder während anderer Arbeit.
3. Einfälle und Ideen bleiben im Kopf und werden wiederholt gedanklich durchgespielt, statt zuverlässig in einem Aufgabenbestand zu landen.
4. Es soll ein ausreichend gepflegter Vorrat an KI-Aufgaben entstehen, aus dem sich Arbeit parallel zu anderen Tätigkeiten beginnen lässt.

Die Anwendung ist für den Nutzer selbst gedacht. Es gibt keinen Auftrag, ein allgemeines SaaS-Produkt mit Teams, Organisationen, Abrechnung oder komplexem Rollenmodell zu bauen.

### Grundhaltung des Produkts

Die Oberfläche und die Aufgabentexte sollen möglichst einfach sein. Der Nutzer will jederzeit verstehen, was ein Eintrag bedeutet, ihn selbst verändern und die Kontrolle behalten. Menschlich und durch KI erstellte Aufgaben sollen sich strukturell nicht auseinanderentwickeln.

Eine einfache Oberfläche schließt notwendige technische Metadaten nicht aus. Die Unterscheidung zwischen Termin, Erledigung, Archivierung und Wiederholung darf im Datenmodell genau sein, ohne daraus ein komplexes Aufgabenformular zu machen.

### Verschiedene Arten von Arbeit

Im Gespräch genannt wurden:

- Kommunikation mit anderen Personen.
- Kleine organisatorische Handlungen, beispielsweise ein Meeting erstellen.
- Softwareentwicklung, kleinere Features, Teilfeatures und Bugfixes.
- Untersuchungen und Informationssammlung mit KI.
- Interaktive Diskussionen mit KI.
- Aufgaben außerhalb des Schreibtischs, etwa im Haushalt.

Diese Beispiele sind **keine verabschiedete Taxonomie**. Für die erste Fassung wurde nur die einfache KI-Kennzeichnung festgelegt. Keine zusätzlichen Typen, Farben oder Aufmerksamkeitszustände aus dieser Liste ableiten.

## 2. Originalbeispiele und daraus gewonnene Erkenntnisse

### Beispiel A: mehrere Aufgabenstränge sichtbar machen

Der Nutzer nannte diese bestehende Liste:

```markdown
- [ ] Zeitbuchung umstellen
  - [ ] Pages in Raycast umziehen
  - [ ] Neuer Workflow für Zeiten buchen
  - [ ] n8n umziehen
  - [ ] Notion löschen
  - [ ] Raycast mit postplan verbinden um Tabellen in HTML zu erzeugen
  - [ ] Raycast Daily Backup
```

Die Subtasks helfen dabei, verschiedene Arbeitsstränge zu erkennen und voneinander zu trennen. Der übergeordnete Eintrag darf eine solche Gruppe zusammenhalten. Die App soll nicht verlangen, daraus ein gesondertes Projektmanagementobjekt mit mehreren zusätzlichen Hierarchieebenen zu machen.

Die Bezeichnung `postplan` ist Teil des ursprünglichen Beispiels. Das ist kein Auftrag, diese konkrete Verbindung im neuen Projekt zu implementieren.

### Beispiel B: ein umfangreicher, isolierter Auftrag

Aufgabe:

> Bildverwendungen aus Bynder einlesen und nach Katpro übertragen

Kontext: Projekt [neo](https://github.com/kochanpartner/neo), Anwendung `obb-sync`.

Der Nutzer konnte diese Aufgabe in einem Agenten-Thread lösen. Obwohl viele Einzelheiten zu beachten waren und er zeitweise Subtasks zur Orientierung verwendet hatte, würde er den Auftrag weiterhin als einen Task akzeptieren. Er weiß anhand des Titels und des Projekts, wie er die Arbeit beginnen und prompten muss.

Die entscheidende Eigenschaft ist der zusammenhängende und klar isolierte Arbeitsauftrag. Umfang oder Zahl technischer Umsetzungsschritte allein erzwingen keine Zerlegung.

Das Repository `neo` wurde für das Konzept nicht inhaltlich untersucht. Ein öffentlicher Abruf im Gespräch lieferte 404. Die Aussagen über diese Aufgabe stammen vom Nutzer; sie sind keine Codeanalyse dieses Projekts.

### Praktische Regel für den Zuschnitt

- Ein Task benennt einen verständlichen Auftrag oder ein zusammenhängendes Vorhaben.
- Ein Task darf umfangreich sein, wenn der Nutzer ihn als Einheit beginnen und abschließen möchte.
- Subtasks helfen bei getrennten Aufgabensträngen oder konkreten Einstiegsschritten.
- Subtasks sollen dem Nutzer sagen, was er konkret angehen kann.
- Es gibt keine feste Zeitgrenze und keine Regel wie "jede Aufgabe muss in 30 Minuten passen".
- Ein technischer Implementierungsplan bleibt im jeweiligen Arbeitsthread.
- Die Aufgabenliste enthält keine ausführlichen Abschnitte zu Implementierung, Umfang, Architektur oder Lösungswegen.

## 3. Begriffe und bestätigte Produktstruktur

| Begriff | Bedeutung |
| --- | --- |
| Bereich | Einer der drei Kontexte `me`, `agency`, `work`. |
| Aktive Liste | Kurze, machbare Liste dessen, was heute oder als Nächstes ansteht. |
| Backlog | Festgehaltene weitere Aufgaben, die momentan nicht anstehen. |
| Task | Oberster Aufgabeneintrag, mit eigener Priorität und bewusstem Abschluss. |
| Subtask | Zweite und letzte Ebene innerhalb eines Tasks; einzeln abhakbar, frei sortierbar, ohne eigene Priorität. |
| Projekt | Erkennbarer Kontext bei work und agency. Keine zusätzliche Aufgabenhierarchie. |
| Inbox | Entfernbare Markierung an einem neu eingegangenen oder noch einzuordnenden Eintrag. |
| Hohe Priorität | Kennzeichnung eines Haupttasks, der besonders wichtig beziehungsweise unbedingt anstehend ist. |
| KI | Kennzeichnung, dass eine Aufgabe mit einem KI-Tool bearbeitet werden kann. |
| Erledigt | Der vom Task beschriebene eigene Beitrag wurde abgeschlossen. |
| Archiviert | Ein erledigter Eintrag wurde aus der Arbeitsansicht aufgeräumt; sein Abschluss bleibt erhalten. |
| Gelöscht / verworfen | Der Nutzer möchte die Aufgabe nicht erledigen. Es entsteht kein Erledigungseintrag. |
| Habits | Separate vierte Liste mit zunächst fünf täglich wiederkehrenden Aufgaben; keine festgelegte Obergrenze. |

### Ansichten und Reihenfolge der Aufmerksamkeit

Die drei Bereiche bleiben in der alltäglichen Arbeit getrennt. Der Nutzer möchte nicht mit allen Aufgaben aller Lebensbereiche gleichzeitig konfrontiert werden.

Die gewünschte Orientierung:

1. Zunächst eine bereichsübergreifende Ansicht der unbedingt anstehenden Haupttasks aus me, agency und work.
2. Danach die aktive Liste des gewählten Bereichs.
3. Danach der Backlog dieses Bereichs.

Die höchste gemeinsame Ansicht wurde im Gespräch unter anderem als "High Priority" bezeichnet. Der genaue UI-Name ist nicht endgültig festgelegt. Sie ist nicht die Inbox.

Der Nutzer entscheidet selbst, wie er nach den wichtigsten Aufgaben seine übrige Zeit auf die Bereiche verteilt. Es wurde kein automatischer Tagesplaner oder Priorisierungsalgorithmus beauftragt.

## 4. Verbindliche Produktregeln

Die IDs dienen dazu, Implementierung und Tests auf nachvollziehbare Anforderungen zu beziehen.

### Bereiche, Hierarchie und Verständlichkeit

| ID | Bestätigte Regel |
| --- | --- |
| P01 | me, agency und work bleiben getrennte Bereiche. |
| P02 | Jeder dieser Bereiche hat eine aktive Liste und einen Backlog. |
| P03 | Eine gemeinsame Ansicht fasst unbedingt anstehende Haupttasks der drei Bereiche zusammen. |
| P04 | Habits ist eine zusätzliche vierte Liste. |
| P05 | Es gibt höchstens Task und Subtask, keine dritte Ebene. |
| P06 | Subtasks haben keine eigene Priorität. |
| P07 | Subtasks haben eine untereinander beliebig veränderbare Reihenfolge. |
| P08 | Ein klar zusammenhängender umfangreicher Auftrag darf ein einzelner Task bleiben. |
| P09 | Bei work und agency muss der Projektname im Eintrag erkennbar sein. |
| P10 | Aufgabentexte enthalten den eigentlichen Auftrag, keine ausführlichen technischen Umsetzungs- oder Umfangsbeschreibungen. |

### Erfassen und Inbox

| ID | Bestätigte Regel |
| --- | --- |
| P11 | Erfassen soll über Handy, Sprache, Assistenten in der Wohnung, MacBook/Raycast und Agentengespräche möglich werden. |
| P12 | Neue Aufgaben erscheinen zunächst mit Inbox-Markierung oben in der aktiven Liste des betreffenden Bereichs. Sie können unvollständig sein. |
| P13 | Bei unklarem Bereich wird ein einstellbarer Standardbereich verwendet, beispielsweise me. |
| P14 | Eine Aufgabe lässt sich schnell in einen anderen Bereich verschieben. |
| P15 | Die Inbox-Markierung lässt sich mit einem Klick entfernen. |
| P16 | Das Entfernen der Inbox-Markierung verändert weder die Position noch die Zugehörigkeit zur aktiven Liste. |

### KI und Aufgabenableitung

| ID | Bestätigte Regel |
| --- | --- |
| P17 | Der Nutzer fordert die KI ausdrücklich dazu auf, Aufgaben aus einem Gespräch abzuleiten. |
| P18 | Die KI soll verstehen, wie sinnvolle Aufträge formuliert, zugeordnet und gegebenenfalls in zwei Ebenen gegliedert werden. |
| P19 | Bei einer möglichen inhaltlichen Dublette fragt die KI ausdrücklich, ob es dieselbe Aufgabe ist oder worin der Unterschied besteht. Sie legt zunächst keine neue Aufgabe an. |
| P20 | Für die erste Fassung genügt die Kennzeichnung KI. |
| P21 | Es gibt zunächst keine zusätzliche KI-Ansicht. |
| P22 | Idealerweise entspricht eine KI-Aufgabe einem Thread; die weitere Threadorganisation liegt im KI-Tool. |
| P23 | Eine Thread-Verknüpfung und Verwaltung laufender KI-Interaktionen gehören nicht zur ersten Fassung. |

### Priorität und Zeitplanung

| ID | Bestätigte Regel |
| --- | --- |
| P24 | Die Reihenfolge offener Haupttasks bildet die vom Nutzer bestimmte Priorität ab. |
| P25 | Diese Reihenfolge kann mehrfach am Tag manuell geändert werden. |
| P26 | Aufgaben lassen sich für einen späteren Tag einplanen oder bis zu einem Zeitpunkt snoozen. |
| P27 | Zum vorgesehenen Zeitpunkt erscheinen solche Aufgaben wieder oben in der aktiven Liste. |
| P28 | Organisatorischer Planungstag und verbindlicher Erledigungstermin haben unterschiedliche Bedeutung. |
| P29 | Offene Aufgaben bleiben grundsätzlich über den Tageswechsel sichtbar, sofern sie nicht bewusst zurückgestellt werden. |
| P30 | Der Nutzer kann die besondere Dringlichkeit einer überfälligen Aufgabe zurücknehmen und sie wieder wie eine normale Aufgabe behandeln. |
| P31 | Hohe Priorität betrifft nur den Haupttask. Wenn ein Subtask unbedingt ansteht, wird sein Haupttask entsprechend markiert. |

### Abschluss, Tagesfortschritt und Zeitbuchung

| ID | Bestätigte Regel |
| --- | --- |
| P32 | Abhaken, erledigt und fertig markieren bezeichnen dieselbe Handlung. |
| P33 | Entwicklungsaufgaben sind für den Nutzer nach Merge des PRs, Deployment und Test erledigt. |
| P34 | Einfache Aufgaben werden nach Ausführung der Handlung abgehakt. |
| P35 | Bei initialer Kommunikation genügt der eigene erste Beitrag. Eine Antwort kann bei Bedarf eine neue Aufgabe auslösen. |
| P36 | Erledigte Haupttasks stehen durchgestrichen oben in ihrer Liste. |
| P37 | Erledigte Subtasks stehen oben in ihrer Subtaskliste. Ihr Parent bleibt an seiner Position und wird dadurch nicht abgeschlossen. |
| P38 | Der Haupttask braucht auch nach Abschluss aller Subtasks einen eigenen bewussten Abschluss. |
| P39 | Ein automatischer nächtlicher Lauf räumt erledigte Einträge aus der Arbeitsansicht. |
| P40 | Die Historie behält Erledigungen nach Tag; die Uhrzeit ist optional. Das gilt auch für Subtasks. |
| P41 | Das separate Zeitbuchungssystem übernimmt alles Weitere. Die Aufgaben-App muss keine Arbeitsdauer erfassen. |
| P42 | Verwerfen beziehungsweise Löschen erzeugt keine erledigte Arbeit für die Zeitbuchung. |

### Wiederholungen

| ID | Bestätigte Regel |
| --- | --- |
| P43 | Aufgaben können nach festen Kalenderterminen wiederkehren. |
| P44 | Eine noch offene Wiederholung wird nicht als zweiter offener Eintrag angelegt. |
| P45 | Die Habits-Liste enthält anfänglich fünf täglich wiederkehrende Aufgaben. Fünf ist keine festgelegte Obergrenze. |
| P46 | Erledigte Habits stehen am neuen Tag wieder zur Verfügung; nicht erledigte bleiben als einzelner Eintrag offen. |

Die Projektzuordnung muss auch bei unvollständiger Erfassung handhabbar bleiben: P09 darf nicht dazu führen, dass eine schnelle Inbox-Erfassung scheitert. Die fehlende Zuordnung kann beim Einordnen ergänzt werden.

## 5. Wichtige Abläufe aus Nutzersicht

### 5.1 Einfall unterwegs

Der Nutzer hält einen Einfall schnell fest, beispielsweise "Mit Alex das Angebot besprechen". Wenn sich der Bereich nicht zuverlässig ermitteln lässt, landet der Eintrag mit Inbox-Markierung im Standardbereich. Dort steht er oben. Später kann der Nutzer Bereich, Projekt und Formulierung ändern, ihn umsortieren oder in den Backlog verschieben.

Entfernt er nur das Inbox-Flag, bleibt der Eintrag an derselben Position. Das ist kein implizites "Einordnen in den Backlog" und kein Anlass für eine automatische Neusortierung.

### 5.2 Aufgaben aus einem Agentengespräch

Der Nutzer sagt sinngemäß, dass die KI jetzt überlegen soll, welche Aufgaben aus dem Gespräch entstehen. Die KI leitet konkrete Aufträge ab, prüft den vorhandenen Bestand und formuliert bei Bedarf Task und Subtasks.

Sie führt keine permanente Überwachung aller Gespräche durch. Die Aufgabe ist auch kein Auftrag, verworfene Ideen, Alternativen oder jeden einzelnen technischen Umsetzungsschritt in der Todoliste zu verewigen.

Wenn beispielsweise bereits "Raycast Daily Backup" existiert und die neue Idee möglicherweise dasselbe meint, fragt der Agent nach. Er entscheidet nicht stillschweigend für eine Kopie oder ein Zusammenführen.

### 5.3 Parallel mit KI arbeiten

Die KI-Kennzeichnung hilft beim Finden von Arbeit, die im KI-Tool begonnen werden kann. Das kann Entwicklung, Recherche oder gemeinsames Nachdenken sein. Nach dem Start organisiert der Nutzer die weitere Interaktion im jeweiligen Tool. Andere Systeme benachrichtigen ihn, wenn er wieder reagieren muss.

Die Todoliste braucht deshalb keine Zustände wie "Agent arbeitet", "wartet auf Nutzer", "Review nötig" oder eine laufende Thread-Synchronisierung.

Der Start eines Threads ist nicht gleichbedeutend mit dem fachlichen Abschluss der Aufgabe. Beim Entwicklungsbeispiel wird erst nach Merge, Deployment und Prüfung abgehakt.

### 5.4 Teilfortschritt bei einem großen Task

Der Nutzer erledigt heute "n8n umziehen" unter "Zeitbuchung umstellen". Das Kind wird abgehakt und innerhalb der Kinder nach oben verschoben. Der Haupttask bleibt offen und behält seine Position. In der Historie kann der abgeschlossene Subtask mit dem Kontext des Parents erscheinen.

Nachts verschwindet der erledigte Subtask aus der Arbeitsansicht. Der Haupttask ist weiterhin offen. Er muss auch dann bewusst abgeschlossen werden, wenn alle seine Kinder bereits erledigt und aufgeräumt sind.

### 5.5 Tagesabschluss

Im Tagesverlauf vermitteln durchgestrichene Einträge im oberen Listenbereich den sichtbaren Fortschritt. Der nächtliche automatische Lauf schafft eine frische Arbeitsansicht. Die Erledigungsdaten bleiben für den Rückblick erhalten.

Der Nutzer hat ausdrücklich klargestellt, dass "fertig markieren" keine zweite Aktion zur sofortigen Archivierung ist. Es ist dasselbe wie Abhaken.

### 5.6 Aufgabe bewusst nicht erledigen

Wenn der Nutzer eine Aufgabe nicht mehr machen möchte, löscht beziehungsweise verwirft er sie. Sie soll nicht in der Zeitbuchung als erledigt erscheinen. Dieses Verhalten muss sich fachlich vom Abhaken unterscheiden.

### 5.7 Normalisierung einer überfälligen Aufgabe

Eine Aufgabe ist überfällig, aber der Nutzer möchte ihr aktuell keine Sonderrolle geben. Er nimmt die Dringlichkeit zurück und sortiert sie wie alle anderen Aufgaben ein. Eine spätere Neuberechnung darf nicht sofort denselben weggeklickten Hinweis wieder erzwingen.

Wie genau Terminmetadaten dabei erhalten bleiben, ist ein technischer beziehungsweise gestalterischer Randfall. Die beobachtbare Anforderung ist die Rückkehr zur normalen Behandlung.

### 5.8 Habit über einen Tageswechsel

Von fünf Habits wurden vier erledigt. Am nächsten Tag sollen wieder fünf Aufgaben bereitstehen: die vier erneut offenen und der weiterhin offene fünfte. Es darf kein sechster Eintrag entstehen. Die vier Erledigungen des Vortags bleiben nachvollziehbar.

## 6. Ausdrücklich zurückgenommene oder ausgeschlossene Ideen

Diese Liste ist für einen übernehmenden Agenten besonders wichtig. Frühere Gesprächsteile dürfen diese Entscheidungen nicht wieder überschreiben.

### Offline wurde wieder gestrichen

Der Nutzer hatte Offline zunächst als wünschenswert bezeichnet. Daraufhin wurden lokale Speicherung, eine dauerhafte Ausgangswarteschlange, Abgleichregeln und ein zusätzliches `libs/client` vorgeschlagen.

Die endgültige Korrektur lautet:

> Vergiss offline erstmal. Wir gehen davon aus immer online zu sein.

Deshalb:

- Keine Offline-Datenbank.
- Keine dauerhafte Offline-Warteschlange.
- Keine CRDT- oder Replicache-Architektur für dieses Projekt.
- Kein nur dafür angelegtes `libs/client`.
- Keine speziellen Datenfelder oder Konfliktregeln aus dem verworfenen Offline-Entwurf übernehmen.
- Normale Fehlerbehandlung bei Verbindungsproblemen und der Standard-Reconnect des Convex-Clients bleiben selbstverständlich möglich. Sie sind keine Offline-Produktzusage.

### Keine zusätzliche KI-Ansicht

Eine separate gefilterte KI-Ansicht wurde vorgeschlagen. Der Nutzer hat sie ausdrücklich für die erste Fassung abgelehnt. Die KI-Kennzeichnung selbst ist bestätigt.

Die spätere Idee verschiedener Farben für interaktive und selbstständig laufende KI-Aufgaben gehört ebenfalls nicht in die erste Fassung.

### Keine Thread-Verknüpfung oder Agenten-Orchestrierung

Es wurde vorgeschlagen, beim Start aus dem Backlog automatisch in die aktive Liste zu wechseln und den Thread zu verknüpfen. Der Nutzer wollte diesen zusätzlichen Ablauf vorerst nicht. Keine solche Automation aus dem Begriff "KI-Aufgabe" ableiten.

### Keine zusätzliche Cloud-Umgebung

Getrennte Entwicklungs- und Produktionsdaten wurden vorgeschlagen. Der Nutzer korrigierte dies zu zunächst einem Produktionsstrang. Keine Staging-Umgebung, keinen zweiten Convex-Datenbestand und keine Preview-Deployments als Voraussetzung verlangen.

Das bedeutet nicht, dass Formatprüfung, Typecheck oder isolierte Tests abgeschafft wurden. Das projektspezifische Testverbot im Referenzprojekt Zpecs ist keine Vorgabe für diese neue Anwendung.

### Weitere Grenzen

- Keine dritte Aufgabenebene.
- Keine eigene hohe Priorität an Subtasks.
- Kein automatischer Abschluss des Parents.
- Keine Zeiterfassung mit Timern oder Arbeitsdauer.
- Keine Implementierungspläne in Aufgabentiteln oder angehängten Task-Beschreibungen.
- Kein sofortiges Railway-Deployment.
- Keine sofortige Umsetzung der kompletten Desktop- oder Mobile-App.
- Keine endgültige Festlegung zu mobilen Widgets, Push und Sprachassistenten-Geräten, bevor diese Clients anstehen.
- Keine neue Auth-Anbieterauswahl: Shoo ist verbindlich. Clerk und WorkOS waren nur Recherchekontext.

## 7. Verbindlicher technischer Rahmen

| ID | Nutzerentscheidung |
| --- | --- |
| T01 | Neues Monorepo nach dem Vorbild von `shubrt/pushdraft`. |
| T02 | Vite+ und das CLI `vp` verwenden. |
| T03 | `apps/web` mit TanStack Start nach `shubrt/zpecs/apps/web`. |
| T04 | Convex für Backend, API, Datenhaltung und Live-Synchronisierung. |
| T05 | Eine extern aufrufbare API mit API-Key für Agenten, Raycast und weitere Eingabewege. |
| T06 | Logging mit evlog sowie Console/Axiom nach den Referenzen. |
| T07 | Anmeldung über Shoo wie bei Pushdraft. |
| T08 | Aufgaben und Erledigungen getrennt modellieren. |
| T09 | Zeitzonen und Tageswechsel korrekt behandeln. |
| T10 | Ein Produktionsstrang für den Anfang. |
| T11 | Lokale Entwicklung mit Portless. |
| T12 | Deployment später über Railway. |
| T13 | Späterer Desktop-Client über Glaze von Raycast. |
| T14 | Späterer Mobile-Client mit Expo. |
| T15 | Ausschließlich Online-Nutzung voraussetzen. |

Die konkrete Wahl Convex Cloud statt Self-Hosting wurde vom Assistenten empfohlen, nicht vom Nutzer ausdrücklich als eigene Entscheidung formuliert. Sie ist die sinnvolle Planungsannahme. "Railway später" allein bedeutet nicht, dass auch Convex auf Railway selbst gehostet werden soll.

Die Zeitzonenbehandlung wurde bestätigt. `Europe/Berlin` stammt aus der Arbeitsumgebung und ist ein geeigneter Startwert, aber keine ausdrücklich vom Nutzer festgelegte unveränderliche Zone.

## 8. Referenzprojekte: tatsächlich festgestellter Stand

Die folgenden Befunde stammen aus read-only Prüfungen während des Gesprächs. Lokale Checkouts wurden gegen GitHub-main verglichen. Sie sind eine Momentaufnahme, keine Garantie, dass die Repositories später unverändert sind.

### 8.1 Pushdraft

- Repository: <https://github.com/shubrt/pushdraft>
- Geprüfter main-Stand: `0d9b1f1`, Datum 2. September 2026.
- Öffentlich zugänglich.
- Struktur: `apps/*`, `libs/*`, `tools/*`.
- Vorhanden: `apps/api`, `apps/cli`, `libs/contracts`, `tools/typescript`.
- API ist dort Elysia/Bun mit PostgreSQL. Das ist keine Architekturvorgabe für das neue Convex-Backend.
- `pnpm@11.1.1`, Node-Mindestanforderung 22, Bun-Mindestanforderung 1.3.10 im geprüften Stand.
- Vite+ als Root-Werkzeug, darunter rekursive Builds, parallele Dev-Scripts, Checks, Typecheck und Sherif.
- `vite-plus ^0.1.21` im geprüften Stand.
- Root-Konfiguration für Lint, Format, Staged-Checks und Tests.
- Gemeinsame TypeScript-Konfiguration unter `tools/typescript`.
- Versionskatalog im `pnpm-workspace.yaml`.
- `libs/contracts` enthält gemeinsam nutzbare runtimevalidierte Verträge mit Zod und Paketexports.
- Eigene Shoo-Integration mit langlebiger App-Session.
- Console-Logging; **kein evlog/Axiom-Setup** in diesem Referenzprojekt gefunden.

Relevante Dateien:

- [package.json](https://github.com/shubrt/pushdraft/blob/main/package.json)
- [pnpm-workspace.yaml](https://github.com/shubrt/pushdraft/blob/main/pnpm-workspace.yaml)
- [vite.config.ts](https://github.com/shubrt/pushdraft/blob/main/vite.config.ts)
- [libs/contracts/package.json](https://github.com/shubrt/pushdraft/blob/main/libs/contracts/package.json)
- [Shoo-Prüfung](https://github.com/shubrt/pushdraft/blob/main/apps/api/src/auth/shoo.ts)
- [Session-Cookies](https://github.com/shubrt/pushdraft/blob/main/apps/api/src/auth/session.ts)
- [Session-Speicherung](https://github.com/shubrt/pushdraft/blob/main/apps/api/src/auth/repository.ts)

### 8.2 Zpecs

- Repository: <https://github.com/shubrt/zpecs>
- Vom Nutzer verlinkte Web-App: <https://github.com/shubrt/zpecs/tree/main/apps/web>
- Geprüfter main-Stand: `5297efd`, Datum 13. August 2026.
- Privat, im Gespräch über authentifiziertes `gh` und vorhandenen Checkout lesbar.
- Ein öffentlicher 404 bedeutet hier nicht, dass das Repository nicht existiert.
- Gleiche grundlegende Workspace-Aufteilung in apps, libs und tools.
- Web: React 19.2.3, TanStack Start `^1.168.7`, Router `^1.170.5`, Vite `^8.0.16` im geprüften Stand.
- Tailwind 4, Radix und Lucide im Web-Vorbild.
- Nitro `^3.0.260610-beta`; Node-Serverausgabe unter `.output/server/index.mjs`.
- Plugin-Reihenfolge im Vite-Setup: TypeScript-Pfade, Tailwind, TanStack Start, React, Nitro.
- Root verwendet vp, Web-Scripts verwenden intern noch Bun mit env-Datei und Vite.
- Railway-Konfiguration baut die Web-App gefiltert und startet den Node-Server.
- Der vorhandene PostgreSQL-Predeploy-Schritt wird nicht in die Convex-App übernommen.
- Logging: einmalige evlog-Initialisierung im Webserver, strukturierte Console-Ausgabe, optional `createAxiomDrain`, Redaction.
- Das fachliche Logging ist in Teilen an Elysia-Middleware angebunden und muss für Convex angepasst werden.
- Auth dort: Clerk mit Organisationen/Workspace-Kontext. Diese Auth- und Mehrbenutzerlogik wird nicht übernommen.
- Die dortige projektspezifische AGENTS-Regel gegen Tests wird nicht auf das neue Projekt übertragen.
- Portless ist im untersuchten Setup noch nicht integriert; dort existiert ein fester Dev-Port.

Relevante Dateien:

- [apps/web/package.json](https://github.com/shubrt/zpecs/blob/main/apps/web/package.json)
- [apps/web/vite.config.ts](https://github.com/shubrt/zpecs/blob/main/apps/web/vite.config.ts)
- [apps/web/src/server/zpecsRuntime.server.ts](https://github.com/shubrt/zpecs/blob/main/apps/web/src/server/zpecsRuntime.server.ts)
- [libs/api/src/_/eventLog.ts](https://github.com/shubrt/zpecs/blob/main/libs/api/src/_/eventLog.ts)
- [apps/web/src/server/auth.ts](https://github.com/shubrt/zpecs/blob/main/apps/web/src/server/auth.ts)
- [railway.json](https://github.com/shubrt/zpecs/blob/main/railway.json)

### 8.3 Konsequenz für die Übernahme

Die Arbeitsweise und Konventionen übernehmen, aber nicht ungeprüft den vollständigen Produktcode kopieren. Insbesondere Elysia, PostgreSQL, Clerk-Organisationen, Pushdraft-Draft-Subdomains und CLI-Veröffentlichung sind projektspezifisch.

Versionsstände vor Implementierung gemeinsam auf Kompatibilität prüfen. Nicht unabhängig mehrere Frameworks auf "latest" setzen und anschließend die Referenzkonfiguration für unverändert gültig halten. Portless nennt aktuell Node 24+; die Mindestanforderung 22 aus den Vorlagen ist deshalb nicht automatisch die passende neue Runtime.

## 9. Empfohlene Zielarchitektur

Die folgende Aufteilung ist eine Umsetzungsempfehlung, passend zur bestätigten Monorepo-Basis:

```text
apps/
  web/
    src/
      routes/
      components/
      features/
      server/
    package.json
    vite.config.ts

libs/
  backend/
    convex/
      _generated/
      schema.ts
      auth.config.ts
      http.ts
      crons.ts
      tasks/
      completions/
      recurrences/
      auth/
      lib/
    test/
    convex.json
    package.json
  contracts/
    src/
    package.json
  logging/
    src/
    package.json

tools/
  typescript/

skills/
  task-capture/
    SKILL.md

docs/
  product-concept.md
  architecture.md
  api.md
  development.md

package.json
pnpm-workspace.yaml
vite.config.ts
```

Die genaue Position von Tests und Konfigurationsdateien muss zur übernommenen vp-Konvention und zur Convex-Konfiguration passen. Dies ist keine unveränderliche Dateiliste. `skills/task-capture` wird erst erstellt, wenn die API und Aufgabenregeln als konkrete Anleitung vorliegen.

### Grenzen der Pakete

- `apps/web` enthält Darstellung, Routing, Web-Login und webseitige Sitzungsanbindung.
- `libs/backend` enthält Schema, Fachlogik, serverseitige Berechtigungsprüfung, HTTP-Eingänge und Zeitsteuerung.
- Clients importieren nur passende generierte API-Referenzen und Typen. Ein Client-Export darf keine serverseitigen Schlüssel oder Node-only-Module mitziehen.
- `libs/contracts` beschreibt stabile externe Request-/Response-Verträge. Es ist keine zweite Datenbankdefinition mit eigener Fachlogik.
- `libs/logging` hält gemeinsame Ereignisfelder und passende Adapter. Es darf keine Node-Abhängigkeiten in Convex-Queries oder Browsercode schleusen.
- Gemeinsame Fachregeln werden im Backend implementiert und von beiden Zugangswegen verwendet.
- Die Web-App ruft Convex für live abonnierte Daten direkt auf. Ein eigener REST-Proxy für sämtliche Live-Abfragen ist nicht vorgesehen.

### Spätere Clients

Expo bekommt bei seiner Umsetzung ein eigenes Paket, beispielsweise `apps/mobile`. Die genaue App-Struktur und Auth-Anbindung werden dann festgelegt.

Glaze stellt bearbeitbare Projektquellen bereit und kann externe Dienste ansprechen. Seine konkreten Bau- und Verpackungskonventionen müssen am tatsächlichen Projekt geprüft werden. Nicht behaupten, dass sich ein Glaze-Projekt bereits nachweislich als gewöhnliches pnpm-Paket mit `vp build` verwalten lässt.

Keine gemeinsamen UI-Komponenten für Web, Glaze und Expo vorab erzwingen. Die gemeinsame API, Identität und Datenlogik sind bereits eine tragfähige Grundlage für die späteren Clients.

### Vorgeschlagener Betrieb

- Convex Cloud für Daten, Queries, Mutations, HTTP Actions und Scheduling.
- Später Railway für den TanStack-Start-/Nitro-Webserver.
- Keine zusätzliche separate API-App für das Aufgaben-CRUD.
- Kein PostgreSQL nur zur Nachbildung der Vorlagen.
- Eine Cloud-Umgebung im ersten Produktionsstrang.

Ein Self-Hosting von Convex auf Railway ist grundsätzlich ein anderer Betriebsweg und wurde nicht beauftragt. Die entsprechende Dokumentation existiert, ersetzt aber keine ausdrückliche Entscheidung für eigenen Backendbetrieb.

## 10. Datenmodell: konkreter Umsetzungsvorschlag

Die folgenden Feldnamen und Tabellen sind Vorschläge. Verbindlich ist das beschriebene Verhalten. Die minimale sichtbare Struktur aus Task und Subtask soll nicht durch die technische Modellierung aufgebläht werden.

### `tasks`: aktuelle Aufgaben und ihre Hierarchie

| Feld | Zweck und Regel |
| --- | --- |
| `_id` | Stabile Convex-ID; kein Titel als Identität. |
| `ownerId` | Interne Identität des einzigen berechtigten Nutzers. Wird aus der Authentifizierung bestimmt. |
| `title` | Kurze, verständliche Aufgabe; kein eingebettetes technisches Pflichtenheft. |
| `parentId?` | Leer bei Haupttasks; verweist bei Subtasks auf einen Haupttask desselben Nutzers. |
| `kind` | Beispielsweise `task` oder `habit`; Habit-Instanzen gehören zur eigenen vierten Ansicht und nicht zu einer Bereichsliste. |
| `area?` | `me`, `agency` oder `work` beim Haupttask. |
| `list?` | `active` oder `backlog` beim Haupttask. |
| `projectName?` | Sichtbarer Projektkontext, insbesondere für `agency` und `work`. |
| `position` | Manuell veränderbare Reihenfolge innerhalb der jeweiligen Liste beziehungsweise der Geschwister. |
| `isInbox?` | Kennzeichnung eines noch zu prüfenden Eintrags. Kein eigener Bearbeitungsstatus. |
| `isAi?` | Einfache KI-Kennzeichnung; keine Aussage über den aktuellen Laufzustand eines Agenten. |
| `highPriority?` | Kennzeichnung für "unbedingt erledigen"; nur Haupttasks. |
| `plannedFor?` | Organisatorisch geplanter lokaler Kalendertag, beispielsweise `2026-09-07`. |
| `dueOn?` | Verbindlicher lokaler Kalendertag. Vom organisatorischen Plan zu unterscheiden. |
| `snoozedUntil?` | Absoluter Zeitpunkt für das erneute Erscheinen. |
| `scheduleVersion?` | Verhindert, dass veraltete geplante Jobs spätere Terminänderungen überschreiben. |
| `state` | Beispielsweise `open`, `done`, `discarded`. |
| `completedAt?` | Serverseitig gesetzter UTC-Zeitpunkt der Erledigung. |
| `archivedAt?` | Zeitpunkt des Wegräumens aus der Arbeitsansicht. |
| `recurrenceId?` | Herkunft aus einer wiederkehrenden Aufgabe. |
| `occurrenceKey?` | Eindeutiger fachlicher Wiederholungszeitraum, etwa ein lokaler Tag. |
| `createdAt`, `updatedAt` | Technische Zeitpunkte für Nachvollziehbarkeit und gegebenenfalls Konfliktprüfung. |

Nicht jedes Feld muss in einem einzigen Formular sichtbar sein. Titel und passende Standardwerte reichen zum schnellen Erfassen. Die Inbox erlaubt gerade, dass Projektzuordnung oder weitere Einordnung zunächst fehlen.

**Empfehlung zur Vererbung:** Bereich, aktive Liste/Backlog und Projekt liegen am Haupttask und gelten für seine Subtasks. Dadurch braucht eine Hierarchie keine widersprüchlichen Zuordnungen. Die Beispiele des Nutzers beschreiben inhaltlich verschiedene Arbeitsstränge; daraus folgt nicht automatisch, dass Subtasks technisch in unterschiedlichen Bereichen liegen sollen. Falls später tatsächlich bereichsübergreifende Unteraufgaben gewünscht werden, ist das eine gesonderte Produktentscheidung.

**Empfehlung zu Subtask-Eigenschaften:** Titel, Reihenfolge, KI-Kennzeichnung und Erledigung sind eigenständig. Termine und Snooze zunächst am Haupttask führen. Explizit ausgeschlossen ist nur eine eigene hohe Priorität der Subtasks; die weiteren Einschränkungen sind Vereinfachungsvorschläge, keine wörtlichen Nutzerentscheidungen.

**Projekte:** Ein sichtbarer Projektname ist erforderlich, ein eigenes Projektverwaltungssystem wurde nicht verlangt. Für den Anfang genügt ein optionaler Name mit Vorschlägen aus vorhandenen Werten. Fehlende Projektnamen dürfen die Erfassung einer Inbox-Aufgabe nicht blockieren. Keine zusätzliche navigierbare Hierarchie aus Organisation, Workspace, Projekt, Epic und Task einführen.

### `completions`: dauerhafter Erledigungsnachweis

Ein Erledigungsereignis wird zusammen mit der Zustandsänderung des Tasks in einer Transaktion angelegt.

| Feld | Zweck |
| --- | --- |
| `ownerId`, `taskId` | Zugehörigkeit und Bezug zum erledigten Eintrag. |
| `parentTaskId?` | Bezug zum Haupttask bei einer Subtask-Erledigung. |
| `titleSnapshot` | Titel zum Zeitpunkt der Erledigung. |
| `parentTitleSnapshot?` | Verständlicher Kontext einer erledigten Subtask. |
| `areaSnapshot`, `projectNameSnapshot?` | Bereich und Projekt zum damaligen Zeitpunkt. |
| `completedAt` | Exakter UTC-Zeitpunkt. |
| `completedLocalDate` | Bereits berechneter lokaler Kalendertag. |
| `timeZoneSnapshot` | Zeitzone, mit der der Tag bestimmt wurde. |
| `kind` | Beispielsweise Haupttask, Subtask oder Habit. |
| `occurrenceKey?` | Bezug zur Wiederholung, falls vorhanden. |

Diese Momentaufnahme verhindert, dass eine spätere Umbenennung, Verschiebung oder Archivierung die Zeitbuchungsgrundlage verändert. Ein abgeschlossener Haupttask und seine bereits früher abgeschlossenen Subtasks können an unterschiedlichen Tagen im Verlauf erscheinen. Das ist korrekt. Die App berechnet daraus keine Arbeitsdauer und addiert keine geschätzten Stunden.

Der normale Erledigungsbefehl ist idempotent: Ist derselbe Eintrag bereits erledigt, entsteht kein zweites Ereignis. Falls später Wiederöffnen gewünscht wird, braucht es eine ausdrückliche Regel für Korrektur oder erneuten Abschluss. Nicht stillschweigend mehrere widersprüchliche Erledigungen erzeugen.

### `recurrences`: Vorlage und Fortschritt einer Wiederholung

Vorgeschlagene Inhalte:

- Nutzer, Aufgabenart und Titelvorlage.
- Bereich, Projekt, KI-Kennzeichnung und gegebenenfalls weitere einfache Standardwerte.
- Zeitzone und kalenderbezogene Wiederholungsregel.
- Aktuell offene Instanz, soweit vorhanden.
- Zuletzt verarbeiteter Zeitraum beziehungsweise nächster Fälligkeitszeitpunkt.
- Aktiviert/deaktiviert.

Für Habits kann dieselbe technische Wiederholungsgrundlage verwendet werden, wenn ihre eigene Ansicht und Tagesregel eindeutig bleiben. Eine zusätzliche Tabelle für Habit-Vorlagen ist ebenfalls vertretbar. Entscheidend ist: fünf konfigurierte Habits ergeben am nächsten Tag wieder fünf Einträge, auch wenn am Vortag nur einige erledigt wurden.

Ein vollständiger generischer RRULE-Editor ist nicht gefordert. Die konkreten benötigten Kalenderregeln zuerst klein halten. Die Formulierung "an jedem zweiten Tag des Monats" ist als Beispiel gefallen und wurde nicht weiter präzisiert; sie darf nicht ungeprüft als Intervall von 48 Stunden interpretiert werden.

### `settings` und Identität

Vorgeschlagene Einstellungen:

- `defaultArea`, etwa `me`, für nicht zugeordnete neue Aufgaben.
- IANA-Zeitzone; `Europe/Berlin` ist ein plausibler Startwert aus der aktuellen Umgebung.
- Gegebenenfalls der zuletzt erfolgreich bearbeitete lokale Tageswechsel.

Eine interne `owners`- oder `users`-Tabelle kann die stabile App-Identität mit verifizierten Shoo-Identitäten verbinden. Sie ist kein Auftrag für eine Mehrbenutzeroberfläche.

### Technische Tabellen bei Bedarf

- `sessions`: gehashte Anwendungssitzungen, Ablaufzeit und Widerruf, falls die unten beschriebene Sitzungsbrücke verwendet wird.
- `apiKeys`: Besitzer, Anzeigename, sicherer Hash, sichtbares Präfix, Erstellungsdatum, Widerruf, optional letzte Nutzung und Ablauf.
- `requestReceipts`: zeitlich begrenzte Zuordnung von Idempotenzschlüsseln zu Ergebnissen externer Schreibbefehle.

Keine Tokens oder vollständigen API-Schlüssel in Klartext speichern. Der Besitzer wird nicht aus einem frei übergebenen `ownerId` übernommen.

### Indizes und Datenzugriffe

Indizes am tatsächlichen Zugriff ausrichten, etwa:

- Aufgaben nach Besitzer, Bereich, Liste und Archiv-/Zustandsmerkmalen.
- Subtasks nach Besitzer und Eltern-ID.
- Erledigungen nach Besitzer und lokalem Abschlusstag beziehungsweise UTC-Zeitpunkt.
- Fällige Zeitaktionen nach nächstem Verarbeitungszeitpunkt.
- API-Schlüssel und Sitzungen nach ihrem Lookup-Hash.
- Wiederholungen nach nächstem Zeitraum und aktuellem Eintrag.

Convex-Indizes sind nicht automatisch SQL-artige Unique Constraints. Eindeutigkeit für Wiederholungsinstanzen, Idempotenz und ähnliche Regeln muss durch passende transaktionale Lese- und Schreiblogik entstehen. Für die kleine persönliche Liste ist eine verständliche Positionsverwaltung mit gelegentlicher Neunummerierung ausreichend. Ein komplexes kollaboratives Sortierverfahren ist nicht vorgegeben.

## 11. Fachliche Befehle und unverzichtbare Invarianten

Gemeinsame Backendfunktionen sollten fachliche Aktionen ausdrücken. Beispiele für die interne API:

- `createTask`, `updateTask`, `moveTask`, `reorderTasks`.
- `addSubtask`, `reorderSubtasks`.
- `clearInbox`.
- `completeTask`, `discardTask`.
- `planTask`, `snoozeTask`, `normalizeUrgency`.
- `processDayBoundary`, `materializeRecurrences`.

Die Namen sind Vorschläge. Web-Mutations und externe HTTP-Endpunkte müssen dieselben Regeln anwenden.

### Hierarchie und Berechtigungen

1. Ein Parent darf selbst keinen Parent haben.
2. Ein Task darf nicht sein eigener Parent sein.
3. Parent und Child müssen demselben Besitzer gehören.
4. Einen Haupttask mit eigenen Subtasks nicht durch einen simplen `parentId`-Patch zu einer dritten Ebene machen.
5. Subtasks erhalten keine eigene hohe Priorität.
6. Berechtigungen für jede Query, Mutation und HTTP-Operation prüfen; ausgeblendete Bedienelemente schützen keine Daten.

### Reihenfolge und sichtbarer Fortschritt

- Beim Einfügen einer neuen Inbox-Aufgabe wird einmalig eine Position ganz oben vergeben.
- `clearInbox` ändert nur die Kennzeichnung. Der Eintrag bleibt exakt dort, wo er vorher stand.
- Deshalb nicht dauerhaft nach `isInbox` sortieren und beim Entfernen der Kennzeichnung in einen anderen Block umsortieren.
- Beim Abschließen eines Haupttasks wird er durchgestrichen ganz oben in seiner Liste gezeigt.
- Beim Abschließen einer Subtask wird nur sie an den Anfang ihrer Geschwisterliste verschoben. Der Parent bleibt an seinem Platz.
- Die Reihenfolge der übrigen offenen Geschwister bleibt erhalten.
- Manuelles Umsortieren von Subtasks bleibt möglich. Eine unveränderliche Sortierung nach Abschlusszeit darf diese Bedienung nicht versehentlich verhindern.
- Die letzte erledigte Subtask schließt den Parent nicht ab.

Eine mögliche Umsetzung ist, bei jeder entsprechenden Aktion die gespeicherten Positionen atomar anzupassen. Getrennte visuelle Gruppen für erledigte und offene Einträge sind ebenfalls möglich, solange das bestätigte Verhalten einschließlich manueller Reihenfolge eingehalten wird.

### Abschluss, Archivierung und Löschen

Diese drei Vorgänge nicht zusammenfallen lassen:

| Aktion | Sichtbare Wirkung | Verlauf |
| --- | --- | --- |
| Abhaken | Durchgestrichen, oben in der passenden Liste. | Erledigung wird sofort gespeichert. |
| Nächtlich wegräumen | Erledigter Eintrag verschwindet aus der Arbeitsansicht. | Erledigung bleibt erhalten. |
| Nicht mehr gewollte Aufgabe löschen | Aufgabe verschwindet. | Keine neue Erledigung erzeugen. |

Für eine noch offene Aufgabe ist `discarded` als technische Form des Löschens ein möglicher Ansatz. Eine physische Löschung ist ebenfalls möglich, wenn historische Verknüpfungen und die gewünschte Sichtbarkeit korrekt behandelt werden.

**Nicht entschieden:** Was passiert beim Löschen eines Parents, dessen Subtasks früher bereits erledigt wurden? Empfehlung: Bestehende Erledigungsereignisse behalten, offene Restarbeit ohne neue Erledigung entfernen. Das erfüllt den bisherigen Zweck des Verlaufs, ist aber als Standardentscheidung zu dokumentieren.

**Nicht entschieden:** Darf ein Parent mit offenen Subtasks abgeschlossen werden? Empfehlung: den ausdrücklich manuellen Abschluss ermöglichen; offene Subtasks dabei nicht automatisch abhaken. Wenn der Parent später archiviert wird, seine offenen Kinder ebenfalls aus der Arbeitsansicht nehmen. Keine erfundenen Subtask-Abschlüsse im Verlauf. Eine knappe Bestätigung für diese konkrete UI-Aktion wäre eine Produktentscheidung, keine bisher vereinbarte Pflicht.

## 12. Anmeldung mit Shoo und Zugriff auf Convex

### Das Integrationsproblem

Der Nutzer möchte Shoo wie in Pushdraft. Pushdraft betreibt nach dem Shoo-Login eine eigene Sitzung über ein HttpOnly-Cookie. Eine solche Sitzung authentifiziert einen Browser nicht automatisch gegenüber dem direkt verbundenen Convex-Client. Diese Verbindung muss ausdrücklich implementiert werden.

Shoo dokumentiert inzwischen eine direkte Convex-Anbindung mit `createShooConvexAuth` und `ConvexProviderWithAuth`. Convex akzeptiert passend konfigurierte Custom JWTs. Das ist eine echte mögliche Integration, nicht die Annahme, dass eine beliebige Cookie-Anmeldung bei Convex bereits funktioniert.

### Zuerst ein kleiner Auth-Prototyp

Vor dem vollständigen Aufgabenbau prüfen:

1. Shoo-Login aus einer Portless-Origin funktioniert.
2. Der berechtigte Nutzer wird zuverlässig identifiziert; andere Shoo-Nutzer erhalten keinen Zugriff.
3. Convex-Abfragen und Mutations funktionieren mit dieser Identität.
4. Tokenablauf, Erneuerung und Logout sind getestet.
5. Die Identität bleibt zwischen lokaler und späterer produktiver Origin dieselbe App-Identität.

Das verhindert, dass die gesamte Oberfläche auf einer ungetesteten Auth-Annahme aufbaut.

### Variante A: offizieller direkter Shoo-Adapter

Vorteile: weniger eigene Sitzungslogik, dokumentierter Integrationsweg.

Zu beachten ist das konkret untersuchte Verhalten von `@shoojs/react` 0.2.2: Die Browserintegration verwendet unter anderem Browserstorage und Navigation. Eine erzwungene Erneuerung kurz vor Ablauf kann einen neuen Sign-in-Redirect auslösen. Ein langlebiger, geräuschlos erneuerbarer Refresh-Token-Mechanismus darf nicht einfach vorausgesetzt werden.

Diese Variante ist geeignet, wenn das tatsächlich beobachtete Sitzungsverhalten zum gewünschten Alltag passt. Die Nutzerentscheidung für Shoo schreibt die exakten Sitzungsdauern von Pushdraft nicht ausdrücklich fest.

### Variante B: eigene Sitzung wie Pushdraft, mit Convex-Token-Brücke

**Empfehlung, falls das Pushdraft-Sitzungsverhalten übernommen werden soll:**

1. Die Web-App startet Shoo Authorization Code mit PKCE. State, Verifier, kurze Gültigkeit und feste erlaubte Redirect-URIs schützen den Loginvorgang.
2. Der Callback prüft die Logintransaktion. Die serverseitige Auth-Grenze tauscht den Code ein und prüft den Shoo-Identitätsnachweis: Signatur, Issuer, Audience, Gültigkeit und benötigte Claims.
3. Eine interne App-Identität wird anhand vorher festgelegter Eigentümerzuordnung ermittelt. Keine öffentliche Funktion `createSession(userId)` anbieten, die einer beliebigen Browserbehauptung vertraut.
4. Die Anwendung erstellt ein zufälliges Sitzungstoken. Der Browser erhält es als `Secure`, `HttpOnly`, `SameSite=Lax` Cookie; das Backend speichert nur den Hash, Besitzer und Ablauf.
5. Ein gleichursprünglicher Web-Endpunkt liest das Sitzungscookie und lässt die Sitzung serverseitig prüfen. Nach erfolgreicher Prüfung wird ein kurzlebiges Convex-kompatibles JWT ausgestellt.
6. Der Browser hält dieses kurzlebige JWT im Speicher und verwendet es für den Convex-Client. Ein tatsächlicher Refresh fordert ein neues Token auf Grundlage der noch gültigen App-Sitzung an.
7. Logout widerruft die App-Sitzung und entfernt das Cookie. Fachliche Convex-Zugriffe prüfen auch den aktiven Sitzungsbezug, damit eine widerrufene Sitzung nicht bis zum JWT-Ablauf weiterverwendet werden kann.

Als Startwerte sind eine bis zu 30 Tage gültige App-Sitzung und ein etwa fünf Minuten gültiges Convex-Token denkbar. **Diese Dauern sind Empfehlungen, keine vom Nutzer festgelegten Anforderungen.**

Die Auth-Verifikation und das Signieren können hinter einem eng definierten Convex-HTTP-Eingang liegen. Dort ist `ctx.runMutation` beziehungsweise `ctx.runAction` für die passenden internen Operationen zu verwenden. Convex HTTP Actions haben keinen direkten `ctx.db`-Zugriff und laufen nicht selbst im Node-Runtime-Modus. Ob benötigte Kryptografie im Standardruntime funktioniert oder eine interne Node-Action nötig ist, muss anhand der gewählten Bibliothek geprüft werden.

Liegt die Sitzungsverwaltung in Convex, prüft der Convex-Auth-Eingang den Shoo-Nachweis selbst. Er übernimmt keine ungeprüften Identitätsfelder vom Webserver. Sitzungserstellung und Token-Ausstellung erfolgen ausschließlich nach dieser Prüfung beziehungsweise nach Prüfung eines gültigen Sitzungstokens. Dafür ist kein Convex Deployment Key oder Admin-Key im Browser oder laufenden Webserver erforderlich.

Das eigene JWT enthält mindestens eine stabile Nutzerkennung und korrekte Standardclaims, beispielsweise `sub`, `iss`, `aud`, `iat`, `exp`; ein `sid` verbindet es mit der widerrufbaren App-Sitzung. Die JWT-Header enthalten `kid`, `alg` und `typ`, beispielsweise den ausdrücklich festgelegten Algorithmus `ES256` und `typ: "JWT"`. Private Signierschlüssel bleiben serverseitig, vorzugsweise an einer einzigen Signierstelle. Öffentliche Schlüssel werden über eine dokumentierte JWKS-Konfiguration bereitgestellt. Schlüsselwechsel ermöglichen.

Die über `sid` gefundene Sitzung muss zum aus `sub` bestimmten Besitzer gehören und noch gültig sein. In einer fachlichen Convex-Query liest der Guard den Sitzungsdatensatz innerhalb derselben Query. Dadurch gehört die Sitzung zu den reaktiven Abhängigkeiten: Ein Widerruf wirkt auch auf bestehende Abonnements. Die Prüfung nur bei der Token-Ausstellung würde diese Eigenschaft nicht liefern.

Der Cookie-basierte Token-Endpunkt muss gegen fremde Origins geschützt werden, etwa durch POST, Origin-Prüfung und eine passende CSRF-Strategie. Das Token nicht in URLs, HTML, Browserlogs oder Analyseereignisse schreiben.

### Eigentümeridentität über verschiedene Origins

Shoo verwendet unter anderem originabhängige beziehungsweise paarweise Identifikatoren. Ein `sub` kann deshalb zwischen einer lokalen Portless-Origin und der Produktionsorigin abweichen. Nicht ungeprüft zwei verschiedene App-Besitzer anlegen.

Eine feste erlaubte Eigentümeridentität vorsehen. Falls das verwendete Shoo-Profil eine verifizierte, originübergreifend geeignete Kennung wie `pii_sub` mit entsprechender Freigabe liefert, diese nach dokumentierter Prüfung binden. Falls nicht, die jeweiligen verifizierten Identitäten gezielt derselben internen App-Identität zuordnen. Eine E-Mail-Allowlist kann zur expliziten Eigentümerfreigabe beitragen, sofern der betreffende Claim tatsächlich verifiziert ist.

Kein öffentliches "der erste Login wird automatisch Besitzer" als unbeabsichtigter Standard. Die konkrete Eigentümerkennung fehlt bisher und wird bei der Einrichtung benötigt.

### Verifikation und Logout

- Bei direktem Shoo-JWT die erwartete Audience für die konkrete App-Origin prüfen. Eine verkürzte Beispielkonfiguration ohne Audience-Bindung nicht blind übernehmen.
- Bei eigener Token-Brücke eigenen Issuer, eigene Audience und erlaubten Algorithmus eindeutig konfigurieren.
- Jeder öffentliche fachliche Convex-Endpunkt prüft Identität und Besitzer.
- Bei der Sitzungsbrücke zusätzlich eine vorhandene, nicht abgelaufene und nicht widerrufene Sitzung prüfen.
- Eine eigene App-Sitzung folgt nicht automatisch jeder späteren Shoo-Kontoeinstellung oder dem Entzug eines Shoo-Consents. Dieses Verhalten entspricht einer eigenen Sitzung und muss bewusst gewählt werden.
- Desktop- und Mobile-Login werden bei diesen Clients konkretisiert. Ein offizielles Expo-Shoo-SDK oder eine fertige native Refresh-Lösung wurde nicht verifiziert.

## 13. Externe API für Agenten, Raycast und weitere Eingänge

### Zwei Eingänge, dieselbe Fachlogik

Die Web-App verwendet den reaktiven Convex-Client. Externe Werkzeuge bekommen eine dokumentierte HTTP-API mit einem Anwendungsschlüssel. Beide Wege ändern dieselben Daten und führen dieselben Fachregeln aus; Änderungen über HTTP erscheinen dadurch live in der Web-App.

Der API-Schlüssel ist **kein Convex Deployment Key und kein Admin-Token**. Der externe Aufrufer bekommt keine Berechtigung, Funktionen zu deployen oder die Datenbank außerhalb der freigegebenen Operationen zu verwalten.

### Vorgeschlagene API-Oberfläche

Die folgende Versionierung und Routeinteilung ist eine Umsetzungsempfehlung:

| Methode und Pfad | Zweck |
| --- | --- |
| `GET /api/v1/tasks` | Aufgaben nach Bereich, Liste und gegebenenfalls Suchtext lesen. |
| `GET /api/v1/tasks/:id` | Task mit verständlichem Kontext und Subtasks lesen. |
| `POST /api/v1/tasks` | Haupttask, optional mit Subtasks, anlegen. |
| `PATCH /api/v1/tasks/:id` | Titel oder erlaubte Metadaten verändern. |
| `POST /api/v1/tasks/:id/subtasks` | Subtask hinzufügen. |
| `POST /api/v1/tasks/:id/complete` | Erledigen und Verlaufseintrag erzeugen. |
| `DELETE /api/v1/tasks/:id` | Nicht mehr gewünschte Aufgabe verwerfen. |
| `POST /api/v1/tasks/:id/move` | Bereich oder aktive Liste/Backlog ändern. |
| `POST /api/v1/tasks/reorder` | Haupttasks innerhalb eines erlaubten Bereichs sortieren. |
| `POST /api/v1/tasks/:id/reorder-subtasks` | Geschwisterreihenfolge verändern. |
| `POST /api/v1/tasks/:id/clear-inbox` | Nur Inbox-Markierung entfernen. |
| `POST /api/v1/tasks/:id/snooze` | Sichtbarkeit bis zu einem Zeitpunkt verschieben. |
| `GET /api/v1/completions` | Erledigungen für einen Tag oder Zeitraum lesen. |

Nicht zwingend jede Route einzeln bauen, wenn ein ebenso verständlicher Vertrag dieselben Aktionen abdeckt. Entscheidend sind minimale, stabile und dokumentierte Operationen. Eine generische Mutation beliebiger Datenbankfelder wäre kein geeigneter Ersatz.

### Beispiel: Task aus einem Agentengespräch

```http
POST /api/v1/tasks
Authorization: Bearer <application-api-key>
Content-Type: application/json
Idempotency-Key: <unique-command-id>
```

```json
{
  "title": "Bildverwendungen aus Bynder einlesen und nach Katpro übertragen",
  "area": "work",
  "projectName": "neo · obb-sync",
  "isAi": true,
  "isInbox": true
}
```

Die Beispielzuordnung zu `work` illustriert die API; sie wurde für dieses konkrete Projekt im Gespräch nicht ausdrücklich bestätigt. Die API darf keine automatische Zuordnung aus dem Organisationsnamen des GitHub-Repositories ableiten.

Ohne Bereich greift die konfigurierte Standardliste. Neue Einträge erscheinen grundsätzlich oben in der aktiven Liste mit Inbox-Markierung. Ein ausdrücklich gewünschtes direktes Anlegen im Backlog kann unterstützt werden; das ist vom Standard für ungeordnete neue Eingänge zu unterscheiden.

Ein mögliches Ergebnis:

```json
{
  "data": {
    "id": "<task-id>",
    "area": "work",
    "list": "active",
    "isInbox": true
  },
  "requestId": "<request-id>"
}
```

### Schlüsselverwaltung

- Schlüssel nur für einen bereits authentifizierten Besitzer erzeugen.
- Den vollständigen Schlüssel einmal anzeigen; später nur Name und kurzes Präfix.
- Zufällige Schlüssel mit ausreichend Entropie generieren; nur einen geeigneten Hash speichern.
- Mehrere benannte Schlüssel ermöglichen, etwa für Coding-Agent, Raycast und eigene Automationen. So lässt sich ein einzelner Zugang widerrufen.
- Widerruf muss bei der nächsten API-Anfrage greifen.
- Keine kompletten Schlüssel in Logs, Fehlermeldungen, Client-Bundles oder Versionskontrolle.
- Feingranulare Scopes sind eine spätere Option, kein Auftrag für ein umfangreiches Rollenmodell. Eine klare Trennung von Lesen und Schreiben wäre bei Bedarf ein kleiner Ausbau.

### Idempotenz und Fehler

Für externe Schreibbefehle einen stabilen Idempotenzschlüssel unterstützen. Wiederholt ein Client dieselbe Anfrage wegen eines Verbindungsabbruchs, soll dieselbe logische Aktion nicht doppelt stattfinden. Gleicher Schlüssel mit abweichendem Payload muss als Konflikt behandelt werden. Schlüsselprüfung und fachliche Änderung müssen atomar zusammenpassen.

Das ist **keine semantische Dublettenerkennung**: Zwei unterschiedlich formulierte Aufgaben können dasselbe meinen, obwohl ihre Request-IDs verschieden sind. Umgekehrt darf nicht jeder ähnliche Titel technisch verboten werden. Der Agent muss mögliche inhaltliche Dubletten erkennen und den Nutzer fragen.

Ein einheitlicher Fehlervertrag soll verständliche Codes enthalten, zum Beispiel `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_INPUT`, `CONFLICT`, dazu eine lesbare Nachricht und Request-ID. Keine internen Stacktraces oder Geheimnisse an Aufrufer zurückgeben. Validierung, Pagination und angemessene Größenlimits gehören zum API-Vertrag; ein umfangreiches öffentliches API-Gateway ist nicht erforderlich.

### Ablauf und spätere Anleitung für Coding-Agenten

1. Nur auf ausdrückliche Aufforderung aus dem Gespräch Aufgaben ableiten.
2. Relevanten Bereich, Projekt und bestehende Aufgaben lesen.
3. Ideen in kurze, für den Nutzer verständliche Aufträge übersetzen.
4. Nur bei echten getrennten Arbeitssträngen Subtasks vorschlagen; höchstens zwei Ebenen.
5. Keine Implementierungsdetails, Akzeptanzchecklisten oder Umfangsanalysen in den Aufgabentitel beziehungsweise zusätzliche Produktfelder hineinschreiben.
6. KI-Kennzeichnung passend setzen.
7. Bei möglicher bestehender gleicher Aufgabe explizit fragen, ob dieselbe Aufgabe gemeint ist oder worin der Unterschied liegt. Bis dahin keine neue Dublette schreiben.
8. Neue Einträge mit Inbox-Markierung und passenden bekannten Zuordnungen anlegen.
9. Dem Nutzer knapp zurückmelden, was tatsächlich angelegt oder geändert wurde.

Ein späterer Capture-Skill soll diese Regeln und die tatsächlichen API-Aufrufe enthalten. Der Nutzer hielt einen Skill für wahrscheinlich hilfreich; er hat kein bestimmtes Format, Agentenprodukt oder Plugin-System vorgeschrieben. Ein MCP-Server kann später ergänzt werden, ist aber für die erste HTTP-API nicht notwendig.

## 14. Zeitsteuerung, Überfälligkeit und Wiederholungen

### Drei unterschiedliche Zeitangaben

1. **Kalendertag:** "Am Montag möchte ich das machen" oder "Am Montag muss es fertig sein". Als lokales Datum mit zugehöriger Zeitzone modellieren.
2. **Konkreter Zeitpunkt:** "Bis heute 15 Uhr snoozen". Als absoluten UTC-Zeitpunkt speichern.
3. **Tatsächlicher Abschluss:** Zeitpunkt des serverseitig bestätigten Abhakens, zusätzlich mit lokalem Tag und damaliger Zeitzone im Verlauf.

Nicht alle drei Angaben in einen einzigen UTC-Mitternachtswert pressen. Das würde Planungsabsicht, Frist und Sichtbarkeit unnötig vermischen.

### Organisatorischer Plan und verbindlicher Termin

- Ein organisatorisch geplanter Task soll am geplanten Tag oben erscheinen.
- Ein verbindlich für diesen Tag festgelegter Task soll zusätzlich als unbedingt zu erledigen erkennbar sein und in die bereichsübergreifende Prioritätsansicht gelangen.
- Nicht erledigte Aufgaben bleiben am Folgetag offen sichtbar.
- Eine Überfälligkeitsanzeige kann den vergangenen Termin kenntlich machen.
- Der Nutzer darf die Aufgabe wieder zu einer normalen Aufgabe machen. Ein nur für wenige Sekunden geschlossener Hinweis, der danach wiederkommt, erfüllt diese Anforderung nicht.

**Empfohlene Tagesgrenze:** Ein verbindliches `dueOn` ohne Uhrzeit umfasst den ganzen lokalen Kalendertag. Die Aufgabe ist an diesem Tag fällig und gehört in die Prioritätsansicht. Überfällig wird sie erst mit Beginn des folgenden lokalen Tages, nicht bereits kurz nach Mitternacht am Fälligkeitstag.

**Empfehlung für "normal machen":** Die aktuelle Dringlichkeitsgrundlage bewusst zurücksetzen, beispielsweise `dueOn` und `highPriority`, während die Aufgabe offen an ihrer aktuellen Position bleibt. Falls ein vergangenes `plannedFor` weiter eine Überfälligkeitsmarkierung erzeugt, auch diese aktuelle Planungsbindung lösen. Historische Ereignisse nicht nachträglich ändern. Die genaue Feldoperation ist eine Empfehlung; bestätigt ist die dauerhafte Rückkehr zu normaler Behandlung.

**Nicht festgelegt:** Wie eine zeitunabhängig manuell als unbedingt markierte Aufgabe in der globalen Ansicht erscheint und wie sich eine hohe Priorität mit Snooze überschneidet. Plausibler Standard: manuell wichtige Aufgaben sind sofort global sichtbar; Snooze verschiebt die Wiedervorlage, ändert aber nicht stillschweigend eine verbindliche Frist. Eine bereits fällige harte Verpflichtung nicht versehentlich unsichtbar machen. Diese Interaktion beim Bau anhand weniger konkreter Beispiele prüfen und dokumentieren.

### Sichtbarkeit und manuelle Reihenfolge

Wiedervorlage bedeutet eine einmalige Aktion: Zum Zeitpunkt des Erwachens wird der Task wieder sichtbar und oben einsortiert. Danach kann der Nutzer ihn wie üblich manuell verschieben. Keine permanente automatische Prioritätssortierung einführen, die jede manuelle Bewegung wieder rückgängig macht.

Eine geänderte Wiedervorlage muss ältere geplante Jobs unwirksam machen. Beispiel: Eine Aufgabe war auf 14 Uhr gesnoozt und wird um 13 Uhr auf morgen verschoben. Der alte 14-Uhr-Job darf sie nicht trotzdem wieder oben einblenden. Dafür eignet sich eine Versionsnummer oder ein Vergleich mit dem aktuellen erwarteten Termin.

### Warum ein Backend-Job erforderlich ist

Convex-Queries werden durch Datenänderungen reaktiv. Das Verstreichen der Uhrzeit allein ist kein Datenbankereignis. Eine Query, die nur `Date.now()` prüft, ist daher kein verlässlicher Tageswechselmechanismus für alle bereits geöffneten Clients.

Zeitaktionen müssen serverseitig Zustände verändern. Geeignete Bausteine sind:

- Geplante Funktionen für konkrete Wiedervorlagen.
- Ein regelmäßiger Cronjob als Aufholmechanismus und für Tages-/Wiederholungswechsel.
- Gespeicherte Verarbeitungsstände, damit mehrfache Aufrufe keine doppelten Effekte erzeugen.

Convex-Crondefinitionen verwenden UTC. Ein täglich starr auf dieselbe UTC-Stunde gesetzter Job bleibt deshalb nicht das ganze Jahr bei derselben lokalen Uhrzeit. Entweder den nächsten lokalen Tageswechsel korrekt berechnen oder regelmäßig fällige lokale Tageswechsel prüfen. Nicht einfach 24 Stunden zum letzten lokalen Tagesanfang addieren.

### Nächtliches Wegräumen

Vorgeschlagener Ablauf pro Besitzer:

1. Aktuelles lokales Datum anhand der gespeicherten Zeitzone bestimmen.
2. Erledigte, noch sichtbare Einträge aus vorherigen lokalen Tagen ermitteln.
3. Diese Einträge archivieren, ohne neue Abschlüsse anzulegen oder ihre Abschlussdaten zu ändern.
4. Wiederholungen und Habits für den neuen Tag verarbeiten.
5. Verarbeitungsstand speichern; bei erneutem Aufruf bleibt das Ergebnis gleich.

Der Job muss funktionieren, während Web-App, Desktop und Telefon geschlossen sind. Ein ergänzender Aufholvorgang nach einer Unterbrechung darf denselben Tag gefahrlos erneut bearbeiten. Ein durchgehend geöffnetes Webfenster muss Änderungen durch die Live-Abonnements erhalten.

### Kalenderwiederholungen ohne offene Dubletten

Die Regel des Nutzers lautet auch für normale Wiederholungen: Eine noch offene vorherige Aufgabe bleibt bestehen; keine zusätzliche offene Kopie erzeugen.

Empfohlener Ablauf für einen fälligen Zeitraum:

1. Wiederholung und bereits verarbeiteten Zeitraum in einer Transaktion lesen.
2. Ist der Zeitraum verarbeitet, nichts erneut erzeugen.
3. Existiert eine offene Instanz, diese behalten.
4. Andernfalls eine neue Instanz aus der Vorlage anlegen.
5. **In beiden Fällen** den Zeitraum als verarbeitet markieren.

Der letzte Punkt ist wesentlich. Wenn eine offene Instanz morgens die neue Erzeugung verhindert und später erledigt wird, darf ein zweiter Cronlauf am selben Tag nicht doch eine neue Kopie erzeugen.

Nach einer mehrtägigen Unterbrechung keine Flut historischer offener Kopien erzeugen. Das ist eine empfohlene Fortsetzung der Regel gegen Dubletten. Bei normalen wiederkehrenden Aufgaben kann die offene alte Instanz ihren ursprünglichen Fälligkeitstag behalten; eine überfällige Pflicht wird nicht durch den Tageswechsel automatisch umdatiert.

### Habits

Habits sind die vierte eigenständige Liste. Für die beispielhaft fünf täglichen Habits gilt:

- Abgehakte Habits zeigen den heutigen Fortschritt und erzeugen einen heutigen Erledigungsnachweis.
- Am nächsten lokalen Tag erscheinen die erledigten Habits wieder offen.
- Nicht abgehakte Habits bleiben als jeweils ein offener Eintrag bestehen.
- Es entstehen weder zehn Einträge noch künstlich als erledigt verbuchte Vortage.
- Streaks, Punktesysteme, Wochenziele und Habit-Statistiken sind nicht beauftragt.

Die technische Instanz darf beim Tageswechsel wechseln oder weiterverwendet werden, solange Historie, Idempotenz und die genau eine aktuelle Darstellung stimmen. Den heutigen Habits-Kontext nicht ungeprüft mit der Überfälligkeitsdarstellung normaler Aufgaben gleichsetzen.

Bei wiederverwendeten Instanz-IDs muss der Abschlussbefehl die erwartete Periode mitführen und das Backend sie prüfen. Ein verspäteter Befehl aus dem Vortag darf nicht nach dem Zurücksetzen derselben ID den heutigen Habit abhaken. Alternativ für neue Perioden neue Instanz-IDs verwenden und alte Abschlüsse entsprechend abweisen. Dieses Problem kann schon bei einem gewöhnlichen Request über Mitternacht auftreten; dafür ist keine Offline-Funktion erforderlich.

## 15. Web-App: notwendige Ansichten und Bedienung

Die folgende Gliederung beschreibt die erforderlichen Fähigkeiten, nicht ein verbindliches visuelles Layout.

### Globale Ansicht für unbedingt zu erledigende Aufgaben

- Relevante Haupttasks aus `me`, `agency` und `work` zusammenführen.
- Bereich und Projekt erkennbar halten.
- Den jeweiligen Bereich mit wenig Aufwand öffnen können.
- Keine separate globale Inbox aus allen ungeprüften Einträgen erzeugen.
- Keine globale KI-Ansicht in Version 1.

Die genaue Reihenfolge innerhalb der globalen Prioritätsansicht wurde nicht festgelegt. Ein eigener dauerhaft zu pflegender Prioritätswert ist dafür zunächst nicht erforderlich. Eine verständliche Reihenfolge anhand Termin und vorhandener Bereichsposition kann als Standard dienen.

### Bereichslisten

- Pro Bereich eine aktive Liste und einen erreichbaren Backlog.
- Aufgaben kompakt mit Checkbox, Titel, Projektkontext und nötigen Kennzeichnungen zeigen.
- Höchstens eine Ebene von Subtasks aufklappen.
- Haupttasks und Subtasks in ihrer jeweiligen Ordnung verändern können.
- Inbox mit einem Klick entfernen, ohne Verschiebung.
- Aufgaben schnell zwischen Bereichen und zwischen aktiver Liste und Backlog bewegen.
- KI-Markierung als einfache Kennzeichnung.
- Datum, verbindliche Dringlichkeit und Snooze bedienbar machen, ohne sämtliche Metadaten ständig einzublenden.
- Heutige Erledigungen durchgestrichen oben zeigen.

### Habits

Eine eigene einfache tägliche Liste mit den konfigurierten Habits und sichtbarem heutigen Fortschritt. Keine Vermischung mit den drei Lebensbereichen erzwingen.

### Erledigungsübersicht

- Erledigte Einträge nach lokalem Tag darstellen.
- Bereich und Projekt als Zuordnung anbieten.
- Bei Subtasks den Parent-Kontext zeigen.
- Uhrzeit optional sichtbar machen.
- Historische Einträge bleiben auch nach der nächtlichen Archivierung verfügbar.

Ein lesbarer Verlauf und die entsprechende API sind die Grundlage für das externe Zeitbuchungssystem. CSV, direkte Integration oder ein bestimmtes Exportformat wurden nicht festgelegt. Kein eigenes Zeiterfassungssystem mit Timern implementieren.

### Einstellungen

Mindestens Standardbereich und Zeitzone; zusätzlich ein kleiner Bereich zum Erzeugen und Widerrufen benannter API-Schlüssel. Auth- und Infrastrukturdetails gehören nicht in den normalen Aufgabenfluss.

### Zustände bei Verbindung und Speicherung

Die App setzt eine Onlineverbindung voraus. Übliche Lade-, Fehler- und Wiederverbindungszustände trotzdem verständlich darstellen. Ein fehlgeschlagener Schreibvorgang darf nicht dauerhaft als erfolgreich abgehakt erscheinen. Falls optimistische Updates genutzt werden, mit der Serverantwort abgleichen und bei Fehlern zurücknehmen.

Kein Offline-Cache, keine lokale Warteschlange für späteres Schreiben, keine Konfliktauflösung zwischen Offline-Kopien und kein Offline-Versprechen. Automatische Reconnect-Funktionen des Convex-Clients sind davon zu unterscheiden.

Mobile Push-Benachrichtigungen, Sprachassistenten, Homescreen-Widgets und die konkrete mobile Nutzung werden erst mit dem mobilen Client geklärt. Die erste Web-App kann responsive sein; das ersetzt diese späteren Produktentscheidungen nicht.

## 16. Logging und Betriebssicht

### Ziel

Der Nutzer wünscht Logging mit `evlog`, Konsole und Axiom nach den Referenzprojekten. Zpecs liefert dafür das konkrete Muster, Pushdraft vor allem einfache Konsolenausgaben. Technische Logs dienen der Fehlersuche, nicht als Ersatz für die fachliche Erledigungshistorie.

### Webserver

- `evlog` einmal passend zum TanStack-Start-/Nitro-Server initialisieren.
- Konsolenausgabe für lokale Entwicklung und Serverbetrieb beibehalten.
- Einen Axiom-Drain anhand serverseitiger Umgebungsvariablen aktivieren, wenn konfiguriert.
- Die konkrete Integration an die verwendeten evlog- und Runtime-Versionen anpassen, nicht ungeprüft Elysia-Middleware aus Zpecs in TanStack Start kopieren.

### Convex

Convex hat eigene Runtime-Grenzen. Queries und Mutations dürfen nicht durch ungeeignete Logging-Transporte Netzwerkzugriffe oder Node-only-Imports erhalten. HTTP Actions und gegebenenfalls interne Actions getrennt betrachten.

Für den Anfang strukturierte Convex-Konsolenlogs verwenden. Eine gemeinsame Ereignisstruktur kann über einen kleinen Adapter genutzt werden. Ob `evlog` direkt in der jeweiligen Convex-Runtime verwendet werden kann, muss der Integrationscheck bestätigen. Einen Axiom-Netzwerk-Drain nicht pauschal in jede Mutation importieren.

Convex dokumentiert native Log Streams zu Axiom. Laut zum Planungszeitpunkt gelesener Dokumentation ist dafür ein Pro-Plan nötig. Das ist eine Betriebsoption und keine Freigabe, einen Tarif zu buchen. Falls dieser Weg nicht gewählt wird, einen geeigneten Export aus einer zulässigen Action-Runtime prüfen oder zunächst die vorhandene Console-/Dashboard-Sicht verwenden.

### Sinnvolle Ereignisfelder

Beispiele: `requestId`, Operation, Clientherkunft, Task-ID, Ergebnis, Dauer und Fehlercode. Für geplante Jobs zusätzlich Zeitraum und Verarbeitungsentscheidung. Herkunft kann als technisches Diagnosefeld dienen; daraus keine neuen sichtbaren Aufgabentypen ableiten.

Persönliche Aufgaben- und Projekttitel nur loggen, wenn für eine konkrete Diagnose erforderlich und bewusst vorgesehen. Tokens, Cookies, Authorization-Header, Shoo-Codes, API-Schlüssel und vollständige Request-Bodies mit privaten Inhalten standardmäßig auslassen beziehungsweise redigieren. Axiom-Zugangsdaten sind ausschließlich serverseitig.

## 17. Lokale Entwicklung, vp und ein Produktionsstrang

### Startpunkt

Ein eigenes neues Repository erstellen beziehungsweise den vom Nutzer dafür gewählten Ort verwenden. Die Struktur von Pushdraft gezielt übernehmen: Workspace-Konventionen, gemeinsame TypeScript-Einstellungen, Kataloge und die `vp`-Befehlsführung.

Die Web-App aus dem Zpecs-Muster ableiten. Keine vollständige Kopie seiner Auth-, Organisations-, Datenbank- oder Deploymentlogik. Die tatsächlichen Befehle in Root und Paketen müssen zusammenpassen und dokumentiert werden.

### Versionen und Package Manager

Die untersuchten Referenzversionen sind in Abschnitt 8 festgehalten. Sie sind Ausgangspunkte, keine ungeprüfte Aufforderung zum Upgrade oder zur exakten Fixierung. Einen konsistenten unterstützten Satz aus Node, pnpm, Vite+, TanStack Start, Vite und Nitro festlegen und im Repository reproduzierbar hinterlegen.

Besonders die Node-Untergrenze prüfen: Pushdraft nennt mindestens Node 22; aktuelle Portless-Dokumentation verlangt Node 24 oder neuer. Für das neue Projekt daher voraussichtlich eine passende Node-24-Version verwenden, statt die niedrigere Mindestangabe blind zu kopieren. Die jeweilige Paketmetadatenlage bei Implementierungsbeginn erneut prüfen.

### Portless

- Einen stabilen lokalen App-Namen verwenden; der endgültige Projektname ist noch offen.
- Die Web-App über Portless und die zur installierten Version passende `vp dev`-Integration starten.
- Keine aus Zpecs kopierte feste Portnummer voraussetzen.
- Shoo-Redirects, Cookie-Eigenschaften und erlaubte Origins mit der tatsächlichen lokalen URL und ihrem Schema prüfen.
- Die Portless-URL betrifft den lokalen Webserver. Sie macht aus Convex Cloud nicht automatisch eine lokale Datenbank.

### Ein Produktionsstrang

Der Nutzer möchte zunächst keine separate cloudbasierte Dev-/Staging-/Produktionslandschaft. Ein lokaler Webserver kann deshalb mit dem ausgewählten einzigen Convex-Backend arbeiten. Diese Entscheidung darf nicht beiläufig durch einen Standard-Setupbefehl aufgehoben werden, der eine zusätzliche Cloud-Entwicklungsumgebung anlegt.

Den Convex-CLI-Workflow vor Einrichtung gegen die aktuelle Dokumentation prüfen. Nicht einfach `convex dev` ausführen und annehmen, damit werde garantiert der gewünschte eine Produktionsstrang verwendet. Codegen, Typecheck und das gezielte Aktualisieren der gewählten Umgebung müssen explizit konfiguriert sein.

Ein einzelner Produktionsstrang bedeutet nicht, dass automatisierte Tests echte Aufgaben verändern sollen. Unit- und Backendtests können isoliert in einem Testprozess laufen, beispielsweise mit `convex-test`, ohne eine zweite dauerhaft betriebene Cloud-Umgebung anzulegen.

Das Deployment auf Railway ist auf später verschoben. Ein lokaler Buildcheck darf vorbereitet werden; keine automatische Veröffentlichung oder Änderung einer produktiven Umgebung aus diesem Plan ableiten.

### Beispielhafte Konfigurationsgruppen

Die exakten Namen beim Bau festlegen und in `.env.example` ohne Geheimwerte erklären:

- Öffentliche Convex-Client-URL und öffentliche App-URL.
- Serverseitige Shoo- und Redirect-Konfiguration, feste Eigentümerzuordnung.
- Bei eigener Sitzungsbrücke: Signierschlüssel und Issuer-/Audience-Konfiguration am vorgesehenen Backend-Ort.
- Optionale serverseitige Axiom-Konfiguration.
- Deployment-Zugangsdaten ausschließlich für die späteren Deploymentwerkzeuge.

Den externen Aufgaben-API-Schlüssel nicht als globalen öffentlichen Frontend-Env-Wert verwenden. Der angemeldete Webclient nutzt seine eigene Nutzeridentität.

## 18. Umsetzungsphasen und überprüfbare Ergebnisse

Die Phasen sind eine empfohlene Arbeitsreihenfolge. Jede Phase soll ein konkretes Ergebnis liefern, das die nächste Phase trägt. Der HTML-Plan fasst denselben Weg kürzer zusammen.

### Phase 1: eigenes Grundgerüst

**Arbeit:** Neues Monorepo nach Pushdraft-Konvention, TanStack-Start-Webapp nach Zpecs, gemeinsame TS-Konfiguration, vp-Befehle, Portless-Start, Platzierung des Convex-Pakets. Minimale Server-/Client-Grenzen und Environment-Dokumentation.

**Fertig, wenn:** Der neue Workspace eigenständig installiert und typgeprüft werden kann; die Web-App lokal unter einer stabilen Portless-URL startet. Kein Inhalt des neuen Projekts landet versehentlich im Skills-Repository. Noch keine unnötigen leeren Desktop-/Mobile-Apps.

### Phase 2: Auth und erste Live-Verbindung

**Arbeit:** Shoo-Login, Eigentümerbindung, Entscheidung zwischen direktem Adapter und eigener Sitzungsbrücke, eine geschützte minimale Convex-Abfrage und Mutation.

**Fertig, wenn:** Zwei geöffnete Webfenster eine berechtigte Änderung live sehen, unberechtigter Zugriff abgewiesen wird und Ablauf/Erneuerung/Logout nachweislich funktionieren. Die lokale Origin ist korrekt berücksichtigt.

### Phase 3: Aufgabenmodell und Fachoperationen

**Arbeit:** Tasks, Subtasks, Bereiche, aktive Listen, Backlogs, Projektname, Inbox, KI-Markierung, manuelle Reihenfolge, Verschieben, Abhaken, Verwerfen und Completion-Snapshots implementieren.

**Fertig, wenn:** Die bestätigten Kernabläufe ohne Zeitsteuerung funktionieren; die letzte Subtask den Parent offen lässt; Inbox-Entfernen die Position erhält; Löschen keinen Abschluss erzeugt.

### Phase 4: Web-Arbeitsoberfläche

**Arbeit:** Globale Prioritätsansicht, drei Bereichsansichten, Backlogs, Habits-Grundansicht, Erledigungsübersicht und kleine Einstellungen. Schnelles Erfassen, verständliche leere Zustände und Speicherrückmeldung.

**Fertig, wenn:** Der Nutzer seinen beschriebenen Ablauf vom Wichtigsten über einen Bereich bis zum Backlog ohne zusätzliche Statuspflege durchführen kann. Tagesfortschritt ist sichtbar; keine zusätzliche KI-Ansicht.

### Phase 5: Zeitsteuerung und Wiederholungen

**Arbeit:** Planung, verbindliche Termine, Normalisieren von Überfälligkeit, Snooze, nächtliche Archivierung, Kalenderwiederholungen und tägliche Habits. Idempotente Jobs und korrekte lokale Datumsberechnung.

**Fertig, wenn:** Wiedervorlagen ohne geöffneten Client funktionieren, offene Wiederholungen keine Dubletten erzeugen und DST-/Tageswechseltests bestehen. Erledigungsdaten bleiben nach dem Aufräumen vollständig lesbar.

### Phase 6: externe API und Agentenanbindung

**Arbeit:** Schlüsselverwaltung, HTTP-Endpunkte, Verträge, Fehlerformat, Idempotenz, Completion-Abfragen und verständliche Beispiele. Danach Capture-Skill anhand der tatsächlich implementierten API formulieren.

**Fertig, wenn:** Ein externer Aufruf eine Aufgabe anlegt und sie live in der Web-App erscheint; wiederholte Requests keine doppelten Einträge erzeugen; ein widerrufener Schlüssel nicht mehr funktioniert. Die Agentenanleitung enthält die ausdrückliche Dublettenrückfrage.

### Phase 7: Logging und vollständige Verifikation

**Arbeit:** Console-/evlog-Integration, optionaler Axiom-Weg, Redigierung und Request-Zuordnung. Die zentralen fachlichen Abläufe sowie Auth- und Scheduler-Grenzen gezielt prüfen.

**Fertig, wenn:** Fehler anhand technischer Ereignisse nachvollziehbar sind, ohne Zugangsdaten oder private Aufgabeninhalte pauschal zu protokollieren. Die erforderlichen Build-, Typ- und Verhaltenstests bestehen und sind dokumentiert.

### Phase 8: spätere Inbetriebnahme und weitere Clients

**Später:** Railway-Webdeployment, produktive Domain und Shoo-Redirects, nötige Zugangsdaten und der gewählte Convex-Betrieb. Anschließend Glaze und Expo mit ihren konkreten UX-, Auth- und Benachrichtigungsanforderungen.

Diese Phase ist eine Vorschau. Sie ist nicht Teil einer schon erteilten Deploymentfreigabe. Offline bleibt auch hier außerhalb des aktuellen Auftrags, solange der Nutzer diese Entscheidung nicht ändert.

## 19. Verifikation: konkrete Verhaltenstests

Die Liste beschreibt zu prüfende Ergebnisse. Sie ist keine Aufforderung, für jeden Satz einen isolierten, implementationsnahen Unit-Test zu schreiben. Backend-Invarianten und Zeitlogik mit sinnvollen automatisierten Tests abdecken; Bedienung und Live-Zusammenspiel mit passenden Integrationstests beziehungsweise gezielten manuellen Prüfungen ergänzen.

| ID | Ausgangslage und Aktion | Erwartetes Ergebnis |
| --- | --- | --- |
| V01 | Aufgabe ohne Bereich über API anlegen. | Landet oben in der aktiven Liste des konfigurierten Standardbereichs mit Inbox-Markierung. |
| V02 | Inbox-Aufgabe zwischen andere Tasks verschieben, anschließend Markierung entfernen. | Identische Position; weder Listenwechsel noch neue Sortierung. |
| V03 | Haupttask mit Subtasks in einen anderen Bereich verschieben. | Konsistenter gemeinsamer Kontext entsprechend der dokumentierten Vererbungsregel. |
| V04 | Subtask unter einer Subtask erzeugen. | Backend weist die dritte Ebene zurück. |
| V05 | Eigene hohe Priorität einer Subtask setzen. | Backend weist die unzulässige Eigenschaft zurück. |
| V06 | Offene Subtasks umsortieren. | Gespeicherte Reihenfolge erscheint auch im zweiten Client. |
| V07 | Mittlere Subtask abschließen. | Durchgestrichen oben bei den Geschwistern; übrige offene Reihenfolge bleibt gleich; Parent bleibt offen und an seiner Position. |
| V08 | Letzte offene Subtask abschließen. | Parent wird nicht automatisch erledigt. |
| V09 | Haupttask abschließen. | Sofort ein Completion-Ereignis; sichtbar durchgestrichen oben. |
| V10 | Abschluss desselben Eintrags wiederholen. | Kein zweites Completion-Ereignis. |
| V11 | Offenen Task verwerfen. | Verschwindet, ohne eine Erledigung für die Zeitbuchung zu erzeugen. |
| V12 | Erledigte Subtask archivieren, Parent offen lassen. | Subtask verschwindet aus der aktuellen Liste; Parent bleibt offen; Verlauf bleibt lesbar. |
| V13 | Nach Abschluss Parent oder Projekt umbenennen. | Vorhandener Erledigungsnachweis behält seinen damaligen verständlichen Kontext. |
| V14 | Normalen geplanten Task am gewünschten Tag aktivieren. | Erscheint oben, ohne allein durch organisatorische Planung zur verbindlichen globalen Pflicht zu werden. |
| V15 | Verbindlich für heute geplanten Haupttask anzeigen. | In seinem Bereich und in der globalen Prioritätsansicht erkennbar. |
| V16 | Nicht erledigte Aufgabe über den Tageswechsel behalten. | Bleibt offen; wird weder abgeschlossen noch gelöscht. |
| V17 | Überfälligen Task zu einer normalen Aufgabe machen. | Verliert die aktuelle Sonderbehandlung dauerhaft, bleibt offen und bedienbar. |
| V18 | Snooze von heute auf morgen ändern, alten Job ausführen. | Alter Job verändert die neue Planung nicht. |
| V19 | Wiedervorlage bei geschlossenen Clients ausführen. | Server aktualisiert die Aufgabe; später geöffnete und bereits verbundene Clients sehen denselben Stand. |
| V20 | Nächtlichen Aufräumjob zweimal für denselben Tag ausführen. | Keine zusätzlichen Abschlüsse, Löschungen oder Wiederholungsinstanzen. |
| V21 | Abschluss nahe UTC-Mitternacht bei anderer lokaler Tagesgrenze. | Completion wird dem richtigen lokalen Tag zugeordnet. |
| V22 | Tageswechsel bei Sommer-/Winterzeitwechsel. | Genau ein lokaler Tageswechsel; keine naive 24-Stunden-Verschiebung. |
| V23 | Wiederholung wird fällig, alte Instanz noch offen. | Eine offene Instanz; Zeitraum wird trotzdem als verarbeitet vermerkt. |
| V24 | Alte offene Wiederholungsinstanz nach Verarbeitung erledigen, Job erneut ausführen. | Keine zweite Instanz für denselben Zeitraum. |
| V25 | Drei von fünf Habits erledigen, Tageswechsel. | Wieder fünf aktuelle Habits; keine Dubletten; drei echte Erledigungen bleiben historisch erhalten. |
| V26 | Mehrere Tage keine Clients öffnen. | Serververarbeitung und Aufholen erzeugen keine Flut offener Kopien. |
| V27 | API-Request mit identischem Idempotenzschlüssel wiederholen. | Gleiches logisches Ergebnis, keine doppelte Aufgabe. |
| V28 | Denselben Idempotenzschlüssel mit anderem Payload verwenden. | Verständlicher Konflikt, keine zweite stillschweigende Aktion. |
| V29 | API-Schlüssel widerrufen und erneut verwenden. | Zugriff verweigert. |
| V30 | API-Änderung bei zwei geöffneten Webclients. | Beide zeigen den bestätigten neuen Zustand live. |
| V31 | Falsche Shoo-Signatur, falscher Issuer oder falsche Audience. | Keine App-Sitzung und kein fachlicher Zugriff. |
| V32 | Ungültiger State, abgelaufene Logintransaktion oder falscher PKCE-Verifier. | Login scheitert ohne Ausgabe nutzbarer Tokens. |
| V33 | Gültiger Shoo-Login einer anderen Person. | Keine automatische Besitzerfreigabe. |
| V34 | Derselbe freigegebene Besitzer über lokale und produktive Origin. | Gleiche interne App-Identität nach der festgelegten Bindung. |
| V35 | Kurzlebiges Convex-Token ablaufen lassen. | Gewähltes Refresh-Verhalten funktioniert und ist für den Nutzer verständlich. |
| V36 | Bei Sitzungsbrücke die App-Sitzung widerrufen. | Neue Zugriffe scheitern; bestehende Abonnements verlieren ihre Berechtigung. |
| V37 | Ein API-Aufruf scheitert bei optimistisch abgehakter UI. | Keine dauerhaft falsche Erfolgsmeldung; Zustand wird korrigiert. |
| V38 | Fehler bei Auth und API bewusst auslösen. | Diagnose möglich, ohne Tokens, Cookies oder Schlüssel in Logs. |
| V39 | Habit-Abschluss aus einer alten Periode nach dem Tageswechsel zustellen. | Kein ungewollter Abschluss des heutigen Habits; Periode oder Instanz-ID verhindert die Verwechslung. |
| V40 | Mehrere geplante Backendläufe ausfallen lassen und anschließend aufholen. | Aktuelle Habits, offene Wiederholungen und fällige Wiedervorlagen werden konsistent hergestellt; keine Dubletten oder veränderte frühere Erledigungen. |

Für Datumsprüfungen eignen sich unter `Europe/Berlin` beispielsweise der 29. März und 25. Oktober 2026 als Umstellungstage. Diese Tage sind Testbeispiele für eine empfohlene Zeitzone, keine Festlegung des späteren persönlichen Standorts.

V15 zusätzlich am Anfang und Ende des Fälligkeitstags prüfen: heute fällig, aber erst am nächsten lokalen Tag überfällig. V26 und V40 sind unterschiedliche Fälle: Geschlossene Clients halten einen funktionierenden Backend-Cron nicht an; ausgefallene Jobausführungen erfordern tatsächliches Aufholen.

Zusätzlich eine kurze praktische Prüfung mit den Originalbeispielen durchführen: `Zeitbuchung umstellen` als Haupttask mit mehreren frei sortierbaren Subtasks sowie der zusammenhängende Bynder-Auftrag als einzelner KI-Task. Dadurch wird sichtbar, ob die Oberfläche ungewollt eine feinere Zerlegung erzwingt.

## 20. Offene Details und empfohlene Standardentscheidungen

Der fachliche Kern ist ausreichend geklärt, um die Umsetzung zu planen. Die folgenden Punkte sind keine Einladung, alle bisherigen Fragen erneut zu stellen. Sie markieren ehrlich, wo der Gesprächsverlauf noch keine genaue Antwort enthält.

| Punkt | Bisheriger Stand | Umgang bei der Umsetzung |
| --- | --- | --- |
| Projektname, Repository und Domain | Noch nicht genannt. | Für Gerüst und Dokumentation neutrale Platzhalter verwenden; endgültige Werte vor Einrichtung der konkreten Ziele bestimmen. |
| Convex Cloud oder Self-Hosting | Convex bestätigt; Betriebsform nicht ausdrücklich gewählt. | Convex Cloud als dokumentierte Empfehlung; Railway zunächst für Web. Kein ungefragtes eigenes Convex-Hosting aufbauen. |
| Konkrete Zeitzone | Zeitzonenkonzept bestätigt, genaue Zone im erhaltenen Verlauf nicht explizit genannt. | `Europe/Berlin` als konfigurierbaren Startwert verwenden, nicht als unumstößliche Anforderung. |
| Besitzeridentität und Zugangsdaten | Noch nicht vorhanden. | Beim Auth-Setup explizit konfigurieren; keine öffentliche Erstlogin-Übernahme. |
| Exakte Shoo-Sitzungsdauer | Shoo wie Pushdraft gewünscht, keine Dauer genannt. | Direkten Adapter prüfen; eigene langlebige Sitzung nur mit bewusstem Verhalten. Vorgeschlagene Dauern dokumentieren. |
| Projektverwaltung | Projektname muss sichtbar sein. | Zunächst einfaches Feld; keine separate Projektmanagementebene erzwingen. |
| Bereich/Projekt an Subtasks | Keine ausdrückliche technische Entscheidung. | Vom Parent erben lassen; bei echtem Bedarf gezielt erweitern. |
| KI-Kennzeichnung an Subtasks | Nicht ausgeschlossen. | Bei eigenständig mit KI angehbaren Subtasks zulassen. |
| Eigene Subtask-Termine | Nicht festgelegt; eigene hohe Priorität ausdrücklich ausgeschlossen. | Planung zunächst am Haupttask halten. |
| Parent-Abschluss mit offenen Kindern | Manueller Parent-Abschluss bestätigt, dieser Randfall offen. | Abschluss erlauben, keine Kinder automatisch erledigen; beim Archivieren aus aktueller Ansicht nehmen. |
| Löschen eines teilweise erledigten Vorhabens | Keine neue Erledigung für verworfene Arbeit. Bestehende Historie nicht ausdrücklich besprochen. | Frühere echte Erledigungen behalten; offene Restarbeit verwerfen. |
| Versehentliches Abhaken und Wiederöffnen | Nicht besprochen. | Nicht stillschweigend einen unklaren Verlauf erzeugen. Wenn Undo eingebaut wird, Korrekturregel gezielt festlegen. |
| Hohe Priorität zusammen mit Snooze | Nicht im Detail besprochen. | Frist nicht durch Snooze verändern; fällige harte Verpflichtungen nicht unbemerkt verstecken. |
| Globale Reihenfolge der wichtigen Tasks | Bereichsübergreifende Ansicht bestätigt, Sortierregel offen. | Verständliche Standardreihenfolge aus Termin und Bereichsposition, ohne neues Prioritätssystem. |
| Konkrete Kalenderregel | Kalenderwiederholung bestätigt, Beispiel sprachlich mehrdeutig. | Nur benötigte Regeln bauen; konkrete Regel bei ihrer Einrichtung wählen. |
| Wiederholungen mit Subtasks | Nicht ausdrücklich besprochen. | Vorlage/Instanz sauber trennen; keine automatische Rücksetzung ohne dokumentierte Regel. |
| Nachträgliche Änderung einer Wiederholung | Nicht besprochen. | Künftige Instanzen ändern; historische Erledigungen nicht umschreiben. Verhalten einer bereits offenen Instanz bewusst festlegen. |
| Export zur Zeitbuchung | Erledigungen pro Tag benötigt; separates System übernimmt Rest. | Verlauf plus lesende API zuerst; Dateiformat oder direkte Integration später nach Bedarf. |
| Axiom für Convex | Gewünscht ist passendes Logging; konkreter Transport/Tarif offen. | Console-Grundlage, native Log Streams oder zulässigen Action-Transport prüfen. Keine Tarifbuchung aus dem Plan ableiten. |
| Glaze-Projektstruktur | Desktop über Glaze bestätigt. | Mit den konkreten Glaze-Projektquellen prüfen, statt ein ungeprüftes pnpm-Buildziel zu versprechen. |
| Mobile Auth, Push, Homescreen | Ausdrücklich auf später verschoben. | Beim Expo-Client behandeln; Web-Kern nicht damit aufhalten. |

Allgemein gilt: Sinnvolle interne IDs, Validierung, Indizes und kleine technische Hilfstabellen dürfen eigenständig gewählt werden. Daraus keine neuen Pflichtfelder, Benutzerrollen oder Produktansichten ableiten.

## 21. Quellen und Nachprüfbarkeit

Die nachfolgenden Quellen wurden für die Planung herangezogen. Softwaredokumentation und `main`-Branches können sich verändern. Die in Abschnitt 8 festgehaltenen untersuchten Commitstände und Paketversionen erklären die damaligen Befunde; die tatsächliche Implementierung muss zu den dann gewählten Versionen passen.

### Nutzerreferenzen und veröffentlichte Konzepte

- [Pushdraft-Repository](https://github.com/shubrt/pushdraft): Monorepo, vp-Konventionen und bisheriges Shoo-Muster.
- [Zpecs Web-App](https://github.com/shubrt/zpecs/tree/main/apps/web): private Referenz für TanStack Start und Serveraufbau; Zugriff war für die Untersuchung authentifiziert vorhanden. Ein nachfolgender Agent benötigt entsprechenden Repository-Zugriff.
- [Neo](https://github.com/kochanpartner/neo): ausschließlich der vom Nutzer genannte Kontext für das Bynder-Beispiel; keine durchgeführte Codeanalyse.
- [Fachliches HTML-Grundkonzept](https://fhpsodb2wtz8.pushdraft.dev) und [technischer HTML-Plan](https://7ytivxot1vcv.pushdraft.dev).

### Monorepo, lokaler Start und spätere Clients

- [Vite+ Guide](https://viteplus.dev/guide/): vp-Werkzeuge und Konventionen.
- [Portless](https://github.com/vercel-labs/portless): lokale benannte URLs, Voraussetzungen und Vite+-Anbindung.
- [Glaze: Managing Projects](https://manual.glaze.app/basics/managing-projects): Projektquellen und Verwaltung.
- [Glaze: Editing Code](https://manual.glaze.app/advanced/editing-code): Bearbeitung der Projektquellen mit externen Werkzeugen.
- [Glaze: Integrations](https://manual.glaze.app/integrations/overview): externe Dienste und Integrationsmöglichkeiten.
- [Raycast: Meet Glaze](https://www.raycast.com/blog/meet-glaze): Produktkontext; Glaze nicht mit der klassischen Raycast-Extension-API gleichsetzen.

### Convex

- [Projektkonfiguration](https://docs.convex.dev/production/project-configuration): eigener Functions-Pfad und Paketplatzierung.
- [TanStack Start](https://docs.convex.dev/client/tanstack/tanstack-start/): Clientintegration und reaktive Datenanbindung.
- [HTTP Actions](https://docs.convex.dev/functions/http-actions): externe HTTP-Eingänge und Aufruf interner Funktionen.
- [Runtimes](https://docs.convex.dev/functions/runtimes): Grenzen zwischen Queries, Mutations, Actions und Node-Runtime.
- [Custom JWT](https://docs.convex.dev/auth/advanced/custom-jwt): JWT-, JWKS-, Issuer- und Audience-Konfiguration.
- [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs): wiederkehrende serverseitige Jobs und UTC-Verhalten.
- [Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions): geplante einmalige Aktionen.
- [Zeit in Queries](https://docs.convex.dev/understanding/best-practices#dont-use-datenow-in-queries): warum Uhrzeit allein keine reaktive Änderung auslöst.
- [Log Streams](https://docs.convex.dev/production/integrations/log-streams): dokumentierte Axiom-Integration und Planvoraussetzung.
- [convex-test](https://docs.convex.dev/testing/convex-test): isolierte Backendtests.
- [Convex Sync](https://www.convex.dev/sync): Synchronisationsmodell; keine daraus abgeleitete Offline-Zusage.
- [Self-Hosting](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md) und [Railway-Beispiel](https://github.com/get-convex/convex-backend/blob/main/self-hosted/advanced/railway/README.md): alternative Betriebswege, hier nicht beauftragt; das Railway-Beispiel ist kein Nachweis einer notwendigen Managed-Architektur.

### Shoo

- [Shoo](https://shoo.dev/): vom Nutzer gewählter Anbieter.
- [Shoo mit Convex](https://docs.shoo.dev/docs/convex): offizieller Adapter.
- [Funktionsweise](https://docs.shoo.dev/docs/how-it-works): Identität und Anmeldeablauf.
- [React API](https://docs.shoo.dev/docs/api-reference/shoo-react): Browserintegration und Auth-Adapter.
- [OpenID-Konfiguration](https://shoo.dev/.well-known/openid-configuration): öffentlich veröffentlichte Anbieterinformationen.
- [SDK-Paket 0.2.2](https://registry.npmjs.org/@shoojs/react/-/react-0.2.2.tgz): ergänzend untersuchter Quellstand für das tatsächliche Browser-/Refresh-Verhalten.

Die detaillierte eigene Sitzungsbrücke, das vorgeschlagene Datenmodell, die API-Routen und die Phasen sind aus diesen Befunden entwickelte Architekturvorschläge. Sie stehen nicht als fertige Referenzimplementierung in den Quellen und wurden noch nicht als neue Anwendung getestet.

## 22. Gesprächsentwicklung und maßgebliche Korrekturen

Diese Übersicht bewahrt die Begründungen für Entscheidungen, die ein nächster Agent sonst leicht wieder aufrollen würde.

1. Ausgangspunkt waren unterschiedliche Tätigkeiten in drei Lebensbereichen. Daraus hätte ein umfangreiches Typensystem entstehen können; für den Start wurde bewusst nur die KI-Markierung gewählt.
2. Die Zeitbuchung braucht abgeschlossene Aufgaben nach Tag, keine Dauerverwaltung. Deshalb ist ein Erledigungsnachweis zentral, ein Timer nicht.
3. "Ein KI-Task entspricht idealerweise einem Thread" beschreibt den Zuschnitt. Der Nutzer verwaltet den laufenden Dialog und Benachrichtigungen im KI-Werkzeug. Daraus folgt keine Threadverwaltung in der To-do-App.
4. Die Bynder-Aufgabe zeigte, dass auch umfangreiche isolierte Arbeit ein Task bleiben darf. `Zeitbuchung umstellen` zeigte den Nutzen von Subtasks für getrennte Arbeitsstränge. Es wurde keine starre Größenmetrik vereinbart.
5. Zwei Ebenen wurden ausdrücklich als Obergrenze festgelegt. Projektname dient der gedanklichen Zuordnung, nicht als weitere Taskebene.
6. Der Backlog bleibt bewusst sichtbar und aktiv nutzbar. Der Nutzer braucht keinen Algorithmus, der ihm automatisch eine Arbeitsauswahl auferlegt.
7. Priorität entsteht in den Bereichslisten durch manuelle Reihenfolge. Verbindliche Tagespflichten erhalten zusätzlich eine bereichsübergreifende Ansicht.
8. Geplante Tage können organisatorisch oder verbindlich sein. Deshalb ist ein einziger undifferenzierter Terminstatus zu wenig.
9. Überfälligkeit soll wegnehmbar sein, indem eine Aufgabe wieder normal behandelt wird. Ein bloß geschlossenes Warnbanner reicht nicht.
10. Eine zusätzliche KI-Ansicht wurde zunächst erwogen und später ausdrücklich verworfen. Die einfache Kennzeichnung wurde beibehalten.
11. Verknüpfungen zu KI-Threads und weitere Automatisierung rund um ihren Start wurden für den Anfang abgelehnt.
12. Abgeschlossen wird nach erfülltem eigenem Arbeitsanteil: bei Entwicklung nach Merge, Deployment und Test; bei Kommunikation nach der eigenen initialen Kontaktaufnahme. Warten auf andere ist kein Pflichtstatus.
13. Inbox ist eine Markierung innerhalb der aktiven Bereichsliste. Sie lässt sich entfernen, ohne die Aufgabe zu verschieben. Ein globales Erfassungsbecken als zusätzliche Hauptliste wurde nicht gewählt.
14. Für nicht zugeordnete Eingänge gibt es eine einstellbare Standardliste. Ein schneller Wechsel in den richtigen Bereich ist erforderlich.
15. Subtasks haben keine eigene hohe Priorität, aber ausdrücklich eine frei veränderbare Reihenfolge.
16. Der Nutzer möchte den heutigen Fortschritt spüren: erledigte Einträge oben und durchgestrichen, nachts aus der Arbeitsansicht räumen. Dieses Wegräumen darf den benötigten Verlauf nicht vernichten.
17. Alle erledigten Subtasks schließen den Parent ausdrücklich nicht automatisch ab. Der Parent benötigt einen eigenen Abschluss.
18. Eine verworfene Aufgabe wird gelöscht und darf dadurch nicht als erledigte Arbeit in der Zeitbuchung erscheinen.
19. Offene wiederkehrende Aufgaben bleiben einfach stehen. Neue Zeiträume erzeugen keine zusätzlichen offenen Kopien.
20. Die Habits-Liste wurde als vierter Kontext ergänzt, mit zunächst fünf täglich zurückkehrenden Aufgaben und derselben Regel gegen Dubletten.
21. Bei möglichen KI-Dubletten soll der Agent ausdrücklich nachfragen. Er soll weder einen neuen Eintrag noch eine Zusammenführung eigenständig als vermeintlich passende Lösung wählen.
22. Technisch wurden Monorepo/vp nach Pushdraft, TanStack Start nach Zpecs, Convex, Shoo, evlog/Console/Axiom, Portless und später Railway gewählt.
23. Als weitere Clients wurden Glaze für Desktop und Expo für Mobile festgelegt. Mobile Nutzung wird erst bei Mobile im Detail geklärt.
24. Der Nutzer lehnte zunächst getrennte Entwicklungs-/Produktionsstränge ab: erst ein Produktionsstrang.
25. Offline wurde ausdrücklich zurückgenommen: "Vergiss offline erstmal. Wir gehen davon aus immer online zu sein." Diese jüngere Entscheidung ersetzt frühere Überlegungen dazu vollständig.
26. Der abschließende Auftrag war ein technischer Plan in HTML und danach eine möglichst vollständige Markdown-Übergabe. Die App-Implementierung wurde in diesem Dokumentationsschritt noch nicht begonnen.

## 23. Startanweisung für den umsetzenden Agenten

Folgender Text kann zusammen mit diesem Dokument als Einstieg dienen:

> Implementiere die persönliche Aufgaben-App auf Grundlage dieses Handoffs. Behandle die bestätigten Produktregeln als entschieden. Nutze Pushdraft als Vorlage für Monorepo und vp sowie Zpecs für die TanStack-Start-Webapp. Lege Convex als gemeinsames Backend für Web und spätere Clients an. Beginne mit einem kleinen überprüfbaren Shoo-/Convex-Auth-Aufbau und implementiere danach die beschriebenen Aufgabenabläufe. Halte Oberfläche und Aufgabentexte minimal. Trenne interne technische Präzision von sichtbarer Produktkomplexität. Die Anwendung setzt Onlineverbindung voraus; es gibt vorerst einen Produktionsstrang. Railway-Deployment, Glaze und Expo folgen später. Prüfe Bibliotheks-APIs an der aktuellen offiziellen Dokumentation. Arbeite im neuen App-Repository, nicht im Skills-Repository, in dem dieses Handoff liegt. Frage nur nach konkreten fehlenden Einrichtungsvoraussetzungen oder echten Produktkonflikten; rolle das gesamte Anforderungsgespräch nicht erneut auf.

Vor der ersten Codeänderung:

1. Zielrepository und dort geltende Anweisungen feststellen.
2. Dieses Dokument einschließlich der offenen Randfälle lesen.
3. Die tatsächlichen erreichbaren Referenzstände prüfen und den gewählten Versionssatz festhalten.
4. Die Paketgrenzen und das minimale Auth-Experiment festlegen.
5. Benötigte konkrete Einrichtungswerte sammeln, sobald der jeweilige Schritt sie erfordert; unabhängige Arbeit fortsetzen.

Nach jedem Umsetzungsschritt den erreichten Zustand und die relevanten Prüfergebnisse festhalten. Empfehlungen, die beim Bau geändert werden, in der Architekturentscheidung aktualisieren. Keine fertigen Integrationen behaupten, solange sie lediglich geplant oder aus Referenzcode abgeleitet sind.

### Stand dieser Übergabe

Das Handoff und der HTML-Plan sind Dokumentationsartefakte. Der fachliche Inhalt wurde gegen den Gesprächsverlauf und die technischen Auth-Aussagen zusätzlich gegen die untersuchten Referenzen gegengelesen. Die Markdown-Datei wurde auf Struktur und erforderliche Themen geprüft. Es wurden noch keine Tests einer neuen Aufgaben-App ausgeführt, weil diese App noch nicht implementiert ist.
