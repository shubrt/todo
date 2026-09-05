# Habits auf einen Blick

Die Expo-App bietet ein dauerhaft platzierbares Homescreen-Widget für iOS und
Android. Zusätzlich lässt sich auf iOS eine Live Activity für Sperrbildschirm
und Dynamic Island starten, auf Android eine laufende Habit-Benachrichtigung.
Die Bedienung steht in [der mobilen Installationsanleitung](../apps/mobile/README.md).

| Fläche                   | Inhalt und Aktionen                                                      | Aktualisierung bei geschlossener App                                          |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| iOS-Widget               | Tagesfortschritt, offene Habits, direkt abhaken, App öffnen              | WidgetKit ruft den Snapshot nativ ab; Timeline wird zum Tageswechsel ungültig |
| iOS Live Activity        | Fortschritt, bis zu drei offene Habits, abhaken                          | App-Updates und native Aktionen; kein APNs-Push-Dienst                        |
| Android-Widget           | Größenverstellbare Liste, abhaken, aktualisieren                         | WorkManager und direkte Widget-Aktionen                                       |
| Android-Benachrichtigung | Tagesfortschritt, nächste Habits, nächste Aufgabe abhaken, aktualisieren | Derselbe native Worker wie beim Widget                                        |

## Grenzen des Betriebssystems

Eine iOS Live Activity bleibt höchstens acht Stunden aktiv. Danach kann sie
noch bis zu vier Stunden auf dem Sperrbildschirm stehen. Das Homescreen-Widget
ist deshalb die dauerhafte Anzeige. [Apple ActivityKit](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities)
beschreibt diese Grenzen.

Ein Widget läuft nicht ständig. iOS verteilt Hintergrundaktualisierungen nach
einem dynamischen Budget; häufig betrachtete Widgets erhalten typischerweise
40 bis 70 Abrufe pro Tag. Ein angeforderter Aktualisierungszeitpunkt ist keine
Garantie. [Apple WidgetKit](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date)
erläutert die Planung.

Android verwendet periodische WorkManager-Aufträge mit mindestens 15 Minuten
Abstand; Netzverbindung und Energiesparregeln können sie weiter verzögern.
Die App fordert keine exakten Alarme und keinen ständig laufenden Dienst an.
[Android WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)
beschreibt die Zeitplanung. Android 14 und neuer erlaubt das Wegwischen
laufender Benachrichtigungen auf entsperrten Geräten; der Nutzer behält die
Kontrolle. [Android 14](https://developer.android.com/about/versions/14/behavior-changes-all)
dokumentiert das Verhalten.

Offene Apps abonnieren Convex direkt. Im Hintergrund zeigen die Flächen den
letzten bestätigten Stand mit Zeitangabe. Ein abgelaufener Tagesstand wird
entsprechend markiert. Eine Live Activity wird nach 30 Minuten ohne Update
oder beim Tageswechsel als veraltet angezeigt.

Android zeigt das Datum des bestätigten Stands und plant zum Tageswechsel
zusätzlich einen lokalen Auftrag ohne Netzbedingung. Dieser blendet den alten
Fortschritt aus und fordert einen neuen Snapshot an. Auch diesen Auftrag darf
das Betriebssystem verzögern.

## Native Implementierung

`apps/mobile/modules/todo-habit-surfaces` enthält das Expo-Modul, SwiftUI,
WidgetKit, ActivityKit und App Intents für iOS sowie Kotlin, RemoteViews,
WorkManager und NotificationCompat für Android. Die Widget-Aktionen benötigen
keinen laufenden JavaScript-Prozess. Expo Go enthält dieses Modul nicht;
die App zeigt dort die fehlenden Funktionen ausdrücklich an.

Der Config-Plugin erzeugt die iOS-Widget-Extension samt App Group, gemeinsamem
Keychain-Zugriff, Quellen, Build-Abhängigkeit und eingebetteter Extension.
EAS erhält dieselben Entitlements für die Signierung. Android bindet das lokale
Expo-Modul einschließlich Manifest und Ressourcen über Autolinking ein.

Gerätezugänge liegen im gemeinsamen iOS-Schlüsselbund beziehungsweise mit
Android Keystore verschlüsselt. Der abgeleitete Snapshot enthält keine Schlüssel.
HTTP-Anfragen erlauben ausschließlich das konfigurierte Convex-Deployment;
Weiterleitungen mit Bearer-Zugang werden nicht verfolgt.

Jeder Abschluss sendet die ursprüngliche Instanz und deren `occurrenceKey`.
Der Server verhindert so, dass ein alter Button den Habit des neuen Tages
erledigt. Wiederholte Übertragung desselben Abschlusses ist idempotent.
Android begrenzt automatische Abschlussversuche auf zwei Minuten; daraus
entsteht keine dauerhafte Offline-Warteschlange. Ein verlorener Netzwerk-Reply
wird als unbestätigter Stand angezeigt und durch erneutes Laden abgeglichen.

Beim Trennen des Geräts werden laufende Synchronisierungen gestoppt und beide
sicheren Speicher geleert. Jede Verbindung besitzt eine eigene Generation.
Verspätete Antworten einer vorherigen Verbindung können keinen neuen Snapshot
überschreiben oder entfernte Daten wiederherstellen. Auf iOS koordinieren
Dateisperre und Prozesssperre die Haupt-App mit der Widget-Extension.

## Build und Abnahme

Expo SDK 57 verwendet React Native 0.86 und verlangt für iOS mindestens
Xcode 26.4. [Expo-Systemvoraussetzungen](https://docs.expo.dev/versions/latest/)
enthalten die Plattformversionen. Eine Apple-Team-Signierung muss App und
Widget-Extension einschließlich App Group abdecken.

Die JavaScript-Bundles und generierten Projekte wurden lokal geprüft. Der
gemeinsame Swift-Code einschließlich Widget und Live Activity besteht die
Typprüfung gegen das vorhandene iOS-Simulator-SDK. Ein vollständiger nativer
App-Build und die Bedienung auf einem echten Gerät stehen noch aus: Die lokale
Xcode-Installation ist zu alt, Android SDK und passendes JDK fehlen. EAS-Profile
und ein Installationswizard sind vorbereitet. Die genauen Checks und offenen
Punkte stehen in [Verifikation](verification.md).
