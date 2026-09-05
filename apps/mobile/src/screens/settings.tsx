import { useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@todo/backend/api";
import type { Connection } from "@todo/native-client";
import {
  endLiveActivity,
  requestPinWidget,
  setNotificationEnabled,
  startLiveActivity,
} from "../../modules/todo-habit-surfaces";
import { Button, Chip, Field, Icon, Notice, SectionLabel } from "../components/ui";
import { useActions } from "../lib/actions";
import { useSurfaces } from "../lib/surfaces";
import { areas, readableError, type Settings } from "../lib/model";
import { base, colors } from "../theme";
import { RecurrenceManager } from "./recurrences";

export function SettingsScreen({
  settings,
  connection,
  onDisconnect,
}: {
  settings: Settings;
  connection: Connection;
  onDisconnect: () => Promise<void>;
}) {
  const update = useMutation(api.settings.update);
  const actions = useActions();
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  async function disconnect() {
    setDisconnecting(true);
    setError("");
    try {
      await onDisconnect();
    } catch {
      setError(
        "Der Gerätezugang konnte nicht vollständig entfernt werden. Bitte erneut versuchen.",
      );
    } finally {
      setDisconnecting(false);
    }
  }
  return (
    <View>
      <SectionLabel>Meine Voreinstellungen</SectionLabel>
      <View style={base.card}>
        <Text style={[base.body, { fontWeight: "600", marginBottom: 6 }]}>Standardbereich</Text>
        <Text style={[base.small, { marginBottom: 14 }]}>
          Für neue Aufgaben ohne feste Zuordnung.
        </Text>
        <View style={[base.row, { gap: 8 }]}>
          {areas.map((area) => (
            <Chip
              key={area}
              selected={settings.defaultArea === area}
              disabled={!actions.connected || actions.pending.has("settings-area")}
              onPress={() => void actions.run("settings-area", () => update({ defaultArea: area }))}
            >
              {area}
            </Chip>
          ))}
        </View>
        <View style={{ marginTop: 22 }}>
          <Field
            label="Zeitzone"
            value={timeZone}
            onChangeText={setTimeZone}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Europe/Berlin"
            hint="Bestimmt Tageswechsel und Erledigungstage."
          />
          <Button
            small
            variant="secondary"
            disabled={!timeZone.trim() || timeZone === settings.timeZone || !actions.connected}
            busy={actions.pending.has("settings-zone")}
            onPress={() =>
              void actions.run("settings-zone", () => update({ timeZone: timeZone.trim() }))
            }
          >
            Zeitzone speichern
          </Button>
        </View>
      </View>
      <SurfaceSettings />
      <SectionLabel>Wiederkehrende Aufgaben</SectionLabel>
      <View style={base.card}>
        <RecurrenceManager defaultArea={settings.defaultArea} />
      </View>
      <SectionLabel>Dieses Gerät</SectionLabel>
      <View style={base.card}>
        <View style={[base.row, { gap: 10, marginBottom: 9 }]}>
          <Icon name="lock-closed-outline" color={colors.green} />
          <Text style={[base.body, { fontWeight: "600" }]}>Sicher verbunden</Text>
        </View>
        <Text selectable style={base.small}>
          {connection.siteUrl.replace("https://", "")}
        </Text>
        <Text style={[base.small, { marginVertical: 15 }]}>
          Der Zugangsschlüssel liegt im sicheren Speicher dieses Geräts. Du kannst ihn jederzeit in
          der Web-App widerrufen.
        </Text>
        {error ? <Notice error>{error}</Notice> : null}
        <Button
          variant="danger"
          icon="log-out-outline"
          busy={disconnecting}
          onPress={() =>
            Alert.alert(
              "Dieses Gerät trennen?",
              "Der gespeicherte Zugang, Widget-Inhalte und die Live-Anzeige werden auf diesem Gerät entfernt. Deine Aufgaben bleiben erhalten.",
              [
                { text: "Abbrechen", style: "cancel" },
                { text: "Gerät trennen", style: "destructive", onPress: () => void disconnect() },
              ],
            )
          }
        >
          Gerät trennen
        </Button>
      </View>
      <Text style={[base.small, { textAlign: "center", marginTop: 24 }]}>
        Todo · Für deine me, agency und work.
      </Text>
    </View>
  );
}

function SurfaceSettings() {
  const { capabilities, snapshot, error: syncError, refreshing, refresh } = useSurfaces();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function run(key: string, operation: () => Promise<string>) {
    if (pending) return;
    setPending(key);
    setMessage("");
    setFailed(false);
    try {
      setMessage(await operation());
    } catch (error) {
      setFailed(true);
      setMessage(readableError(error));
    } finally {
      setPending(null);
    }
  }
  const unavailable = !capabilities?.nativeAvailable;
  return (
    <>
      <SectionLabel>Habits auf einen Blick</SectionLabel>
      <View style={base.card}>
        <View style={[base.row, { gap: 14, marginBottom: 15 }]}>
          <View style={{ padding: 12, borderRadius: 14, backgroundColor: colors.greenLight }}>
            <Icon name="phone-portrait-outline" size={25} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[base.body, { fontWeight: "600" }]}>Dein täglicher Fortschritt</Text>
            <Text style={base.small}>
              {snapshot
                ? `${snapshot.completedCount} von ${snapshot.totalCount} Habits erledigt`
                : "Der aktuelle Stand wird geladen."}
            </Text>
          </View>
        </View>
        {snapshot ? (
          <Text style={[base.small, { marginBottom: 13 }]}>
            Zuletzt aktualisiert um{" "}
            {new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(
              snapshot.generatedAt,
            )}
            .
          </Text>
        ) : null}
        {syncError ? <Notice error>{syncError}</Notice> : null}
        {message ? (
          <Notice error={failed} onClose={() => setMessage("")}>
            {message}
          </Notice>
        ) : null}
        {unavailable ? (
          <Notice>
            Widgets und Live-Anzeige benötigen die installierte native App. In Expo Go oder einer
            Webvorschau sind sie nicht verfügbar.
          </Notice>
        ) : (
          <>
            <Text style={[base.body, { fontWeight: "600", marginTop: 3 }]}>Homescreen-Widget</Text>
            <Text style={[base.small, { marginTop: 5, marginBottom: 13 }]}>
              {Platform.OS === "ios"
                ? "Halte den Homescreen gedrückt, wähle Bearbeiten → Widget hinzufügen und suche Todo. Das Widget zeigt deine heutigen Habits."
                : "Füge Todo zu deinem Homescreen hinzu. Deine Habits bleiben dort sichtbar und lassen sich direkt erledigen."}
            </Text>
            {Platform.OS === "android" ? (
              <Button
                small
                variant="secondary"
                icon="apps-outline"
                busy={pending === "pin"}
                disabled={Boolean(pending) || !capabilities?.widgets}
                onPress={() =>
                  void run("pin", async () => {
                    const supported = await requestPinWidget();
                    if (!supported) {
                      setFailed(true);
                      return "Dieser Launcher unterstützt das Hinzufügen aus der App nicht. Nutze seinen Widget-Auswahldialog.";
                    }
                    return "Bestätige das Hinzufügen im Widget-Dialog deines Homescreens.";
                  })
                }
              >
                Widget hinzufügen
              </Button>
            ) : null}
            {capabilities?.liveActivities ? (
              <View style={{ marginTop: 23 }}>
                <Text style={[base.body, { fontWeight: "600" }]}>Live auf dem Sperrbildschirm</Text>
                <Text style={[base.small, { marginTop: 5, marginBottom: 13 }]}>
                  Starte eine Live Activity für deinen heutigen Fortschritt. iOS beendet sie nach
                  spätestens acht Stunden; das Homescreen-Widget bleibt.
                </Text>
                <View style={{ gap: 8 }}>
                  <Button
                    small
                    variant="secondary"
                    icon="pulse-outline"
                    busy={pending === "start"}
                    disabled={Boolean(pending) || !snapshot?.totalCount}
                    onPress={() =>
                      void run("start", async () => {
                        if (!(await refresh())) {
                          setFailed(true);
                          return "Der aktuelle Stand konnte nicht geladen werden. Bitte erneut aktualisieren.";
                        }
                        const id = await startLiveActivity();
                        if (!id) {
                          setFailed(true);
                          return "Die Live Activity konnte nicht gestartet werden. Prüfe, ob Live-Aktivitäten für Todo erlaubt sind.";
                        }
                        return "Deine Live Activity ist gestartet.";
                      })
                    }
                  >
                    Live Activity starten
                  </Button>
                  <Button
                    small
                    variant="ghost"
                    disabled={Boolean(pending)}
                    onPress={() =>
                      void run("end", async () => {
                        await endLiveActivity();
                        return "Die Live Activity wurde beendet.";
                      })
                    }
                  >
                    Live Activity beenden
                  </Button>
                </View>
              </View>
            ) : null}
            {capabilities?.ongoingNotification ? (
              <View style={{ marginTop: 23 }}>
                <Text style={[base.body, { fontWeight: "600" }]}>Habits als Benachrichtigung</Text>
                <Text style={[base.small, { marginTop: 5, marginBottom: 13 }]}>
                  Eine ruhige, laufende Anzeige deines Fortschritts. Android kann sie ausblenden
                  oder dich wegwischen lassen.
                </Text>
                <View style={{ gap: 8 }}>
                  <Button
                    small
                    variant="secondary"
                    icon="notifications-outline"
                    busy={pending === "notification"}
                    disabled={Boolean(pending)}
                    onPress={() =>
                      void run("notification", async () => {
                        const enabled = await setNotificationEnabled(true);
                        if (!enabled) {
                          setFailed(true);
                          return "Benachrichtigungen sind nicht erlaubt. Aktiviere sie bei Bedarf in den Android-Einstellungen für Todo.";
                        }
                        return "Die Habit-Benachrichtigung ist aktiviert.";
                      })
                    }
                  >
                    Benachrichtigung aktivieren
                  </Button>
                  <Button
                    small
                    variant="ghost"
                    disabled={Boolean(pending)}
                    onPress={() =>
                      void run("notification-off", async () => {
                        await setNotificationEnabled(false);
                        return "Die Habit-Benachrichtigung ist ausgeschaltet.";
                      })
                    }
                  >
                    Benachrichtigung ausschalten
                  </Button>
                </View>
              </View>
            ) : null}
            <Text style={[base.small, { marginTop: 18 }]}>
              Bei geschlossener App bestimmt das Betriebssystem, wann neue Daten geladen werden. Ein
              Widget zeigt den letzten bestätigten Stand.
            </Text>
          </>
        )}
        <View style={{ marginTop: 15 }}>
          <Button
            small
            variant="secondary"
            icon="refresh-outline"
            busy={refreshing}
            disabled={Boolean(pending)}
            onPress={() => void refresh()}
          >
            Stand aktualisieren
          </Button>
        </View>
      </View>
    </>
  );
}
