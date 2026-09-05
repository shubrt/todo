import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import {
  cloudUrlFromSite,
  createTokenProvider,
  NativeApiError,
  parseConnection,
  type Connection,
} from "@todo/native-client";
import { api } from "@todo/backend/api";
import { clearSurfaces } from "../modules/todo-habit-surfaces";
import { Button, Chip, Icon, Notice, type IconName } from "./components/ui";
import { retainClient } from "./lib/client-lifecycle";
import { ActionsProvider, useActions } from "./lib/actions";
import { SurfaceProvider, stopSurfaceSync } from "./lib/surfaces";
import { forgetConnection, loadConnection, saveConnection } from "./lib/session";
import { localDate, areas, type Screen, type Task } from "./lib/model";
import { ConnectScreen } from "./screens/connect";
import { CaptureSheet, TaskEditor } from "./screens/task-editor";
import { TasksScreen } from "./screens/tasks";
import { HabitsScreen } from "./screens/habits";
import { HistoryScreen } from "./screens/history";
import { SettingsScreen } from "./screens/settings";
import { type Area } from "@todo/contracts";
import { areaColors, base, colors } from "./theme";

export default function App() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void loadConnection()
      .then((value) => {
        if (active) setConnection(value);
      })
      .catch(() => {
        if (active)
          setStartupError(
            "Der gespeicherte Zugang konnte nicht gelesen werden. Bitte erneut verbinden.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const connect = useCallback(async (next: Connection) => {
    const token = await createTokenProvider(next)({ forceRefreshToken: true });
    if (!token)
      throw new NativeApiError("UNAUTHENTICATED", "Dieser Geräteschlüssel ist nicht gültig.", 401);
    await stopSurfaceSync();
    await clearSurfaces();
    await saveConnection(next);
    setConnection(next);
    setRevision((value) => value + 1);
    setStartupError("");
  }, []);
  useEffect(() => {
    function incoming(url: string) {
      if (!url.startsWith("todo://connect")) return;
      try {
        const next = parseConnection(url);
        Alert.alert(
          "Todo verbinden?",
          `Dieses Gerät mit ${next.siteUrl.replace("https://", "")} verbinden.`,
          [
            { text: "Abbrechen", style: "cancel" },
            {
              text: "Verbinden",
              onPress: () => {
                void connect(next).catch(() =>
                  Alert.alert(
                    "Verbindung fehlgeschlagen",
                    "Prüfe den Zugangsschlüssel und deine Internetverbindung.",
                  ),
                );
              },
            },
          ],
        );
      } catch {
        Alert.alert(
          "Ungültiger Verbindungslink",
          "Erzeuge in der Web-App einen neuen Gerätezugang.",
        );
      }
    }
    const subscription = Linking.addEventListener("url", ({ url }) => incoming(url));
    void Linking.getInitialURL().then((url) => {
      if (url) incoming(url);
    });
    return () => subscription.remove();
  }, [connect]);
  const disconnect = useCallback(async () => {
    await stopSurfaceSync();
    await clearSurfaces();
    await forgetConnection();
    setConnection(null);
    setRevision((value) => value + 1);
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {loading ? (
        <View style={[base.screen, styles.center]}>
          <View style={styles.logo}>
            <Icon name="checkmark" size={31} color={colors.green} />
          </View>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : connection ? (
        <MobileBoundary
          key={`${revision}:${connection.siteUrl}`}
          onRetry={() => setRevision((value) => value + 1)}
          onDisconnect={disconnect}
        >
          <ConnectedApp
            connection={connection}
            onRetry={() => setRevision((value) => value + 1)}
            onDisconnect={disconnect}
          />
        </MobileBoundary>
      ) : (
        <ConnectScreen onConnect={connect} initialError={startupError} />
      )}
    </SafeAreaProvider>
  );
}

function ConnectedApp({
  connection,
  onDisconnect,
  onRetry,
}: {
  connection: Connection;
  onDisconnect: () => Promise<void>;
  onRetry: () => void;
}) {
  const [authError, setAuthError] = useState("");
  const client = useMemo(
    () =>
      new ConvexReactClient(cloudUrlFromSite(connection.siteUrl), {
        unsavedChangesWarning: false,
        logger: false,
      }),
    [connection.siteUrl],
  );
  const tokenProvider = useMemo(() => createTokenProvider(connection), [connection]);
  const fetchAccessToken = useCallback(
    async (options: { forceRefreshToken: boolean }) => {
      try {
        const token = await tokenProvider(options);
        setAuthError(token ? "" : "Der Gerätezugang ist abgelaufen oder wurde widerrufen.");
        return token;
      } catch (error) {
        setAuthError(
          error instanceof NativeApiError
            ? error.message
            : "Die Verbindung kann gerade nicht hergestellt werden.",
        );
        return null;
      }
    },
    [tokenProvider],
  );
  const useDeviceAuth = useMemo(
    () => () => ({ isLoading: false, isAuthenticated: true, fetchAccessToken }),
    [fetchAccessToken],
  );
  useEffect(() => retainClient(client), [client]);
  return (
    <ConvexProviderWithAuth client={client} useAuth={useDeviceAuth}>
      <AuthGate message={authError} onRetry={onRetry} onDisconnect={onDisconnect}>
        <ActionsProvider>
          <SurfaceProvider connection={connection}>
            <Workspace connection={connection} onDisconnect={onDisconnect} />
          </SurfaceProvider>
        </ActionsProvider>
      </AuthGate>
    </ConvexProviderWithAuth>
  );
}

function AuthGate({
  children,
  message,
  onRetry,
  onDisconnect,
}: {
  children: ReactNode;
  message: string;
  onRetry: () => void;
  onDisconnect: () => Promise<void>;
}) {
  const auth = useConvexAuth();
  if (auth.isAuthenticated) return children;
  const failure =
    message ||
    (!auth.isLoading
      ? "Die Anmeldung wurde vom Backend nicht bestätigt. Bitte erneut verbinden."
      : "");
  return (
    <SafeAreaView style={[base.screen, styles.center]}>
      <View style={styles.logo}>
        <Icon name="checkmark" color={colors.green} size={31} />
      </View>
      <Text style={[base.title, { fontSize: 25 }]}>
        {failure ? "Kurz neu verbinden." : "Deine Aufgaben kommen."}
      </Text>
      <Text style={[base.subtitle, { textAlign: "center", marginBottom: 22 }]}>
        {failure || "Die sichere Verbindung wird hergestellt."}
      </Text>
      {failure ? (
        <View style={{ gap: 9 }}>
          <Button onPress={onRetry} icon="refresh-outline">
            Erneut versuchen
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              void onDisconnect().catch(() =>
                Alert.alert("Gerät konnte nicht getrennt werden", "Bitte versuche es erneut."),
              );
            }}
          >
            Mit anderem Zugang verbinden
          </Button>
        </View>
      ) : (
        <ActivityIndicator color={colors.green} />
      )}
    </SafeAreaView>
  );
}

const navigation: { id: Screen; label: string; icon: IconName; activeIcon: IconName }[] = [
  { id: "priority", label: "Wichtig", icon: "star-outline", activeIcon: "star" },
  { id: "area", label: "Bereiche", icon: "layers-outline", activeIcon: "layers" },
  { id: "habits", label: "Habits", icon: "leaf-outline", activeIcon: "leaf" },
  { id: "history", label: "Rückblick", icon: "time-outline", activeIcon: "time" },
  { id: "settings", label: "Mehr", icon: "options-outline", activeIcon: "options" },
];

function Workspace({
  connection,
  onDisconnect,
}: {
  connection: Connection;
  onDisconnect: () => Promise<void>;
}) {
  const settings = useQuery(api.settings.get, {});
  const summary = useQuery(api.tasks.summary, {});
  const actions = useActions();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("priority");
  const [area, setArea] = useState<Area>("me");
  const [list, setList] = useState<"active" | "backlog">("active");
  const [capture, setCapture] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [time, setTime] = useState(Date.now());
  useEffect(() => {
    const update = () => setTime(Date.now());
    const timer = setInterval(update, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    function handle(url: string) {
      if (url.startsWith("todo://habits")) setScreen("habits");
    }
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    return () => subscription.remove();
  }, []);
  const today = settings?.currentLocalDate ?? localDate(time);
  const title =
    screen === "area"
      ? area
      : screen === "priority"
        ? "Wichtig"
        : screen === "habits"
          ? "Meine Habits"
          : screen === "history"
            ? "Rückblick"
            : "Einstellungen";
  const subtitle =
    screen === "area"
      ? area === "me"
        ? "Dein Leben neben der Arbeit."
        : area === "agency"
          ? "Raum für deine eigenen Vorhaben."
          : "Ein klarer Blick auf deine Arbeit."
      : screen === "priority"
        ? "Was heute wirklich zählt."
        : screen === "habits"
          ? "Kleine Schritte, die zu dir gehören."
          : screen === "history"
            ? "Das hast du auf den Weg gebracht."
            : "So passt Todo zu deinem Alltag.";
  return (
    <SafeAreaView style={base.screen} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <View style={[base.row, { gap: 8 }]}>
          <View style={styles.miniLogo}>
            <Icon name="checkmark" size={15} color={colors.green} />
          </View>
          <Text style={styles.wordmark}>todo</Text>
        </View>
        <Text style={styles.date}>
          {new Intl.DateTimeFormat("de-DE", {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: settings?.timeZone ?? "Europe/Berlin",
          }).format(time)}
        </Text>
        <View style={styles.connectionDot}>
          {!actions.connected ? (
            <Icon name="cloud-offline-outline" color={colors.amber} size={17} />
          ) : (
            <View style={styles.connectedDot} />
          )}
        </View>
      </View>
      <ScrollView
        key={screen}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[base.content, { paddingBottom: 125 }]}
      >
        {!actions.connected ? (
          <Notice>Verbindung wird wiederhergestellt. Deine Aufgaben bleiben sichtbar.</Notice>
        ) : null}
        {actions.message ? (
          <Notice error onClose={actions.clearMessage}>
            {actions.message}
          </Notice>
        ) : null}
        <View style={base.between}>
          <Text style={base.title}>
            {title}
            <Text style={{ color: colors.muted }}>.</Text>
          </Text>
          {screen === "priority" && summary?.todayCompleted ? (
            <View style={styles.todayCount}>
              <Icon name="checkmark-done" size={15} color={colors.green} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.green }}>
                {summary.todayCompleted}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={base.subtitle}>{subtitle}</Text>
        {screen === "area" ? (
          <>
            <View style={styles.areas}>
              {areas.map((entry) => (
                <Pressable
                  key={entry}
                  accessibilityRole="button"
                  accessibilityState={{ selected: area === entry }}
                  onPress={() => {
                    setArea(entry);
                    setList("active");
                  }}
                  style={[styles.area, area === entry && styles.areaSelected]}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: areaColors[entry],
                    }}
                  />
                  <Text
                    style={[
                      styles.areaName,
                      area === entry && { color: colors.green, fontWeight: "700" },
                    ]}
                  >
                    {entry}
                  </Text>
                  <Text style={styles.areaCount}>{summary?.[entry] ?? ""}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[base.row, { gap: 8, marginTop: 17 }]}>
              <Chip selected={list === "active"} onPress={() => setList("active")}>
                Aktive Liste
              </Chip>
              <Chip selected={list === "backlog"} onPress={() => setList("backlog")}>
                Backlog
              </Chip>
            </View>
          </>
        ) : null}
        {screen === "area" || screen === "priority" ? (
          <TasksScreen
            key={`${screen}:${area}:${list}`}
            view={screen}
            area={area}
            list={list}
            today={today}
            onEdit={setEditing}
            onCapture={() => setCapture(true)}
          />
        ) : null}
        {screen === "habits" && settings ? (
          <HabitsScreen
            settings={settings}
            onEdit={setEditing}
            onSurfaces={() => setScreen("settings")}
          />
        ) : null}
        {screen === "history" ? <HistoryScreen today={today} /> : null}
        {screen === "settings" && settings ? (
          <SettingsScreen settings={settings} connection={connection} onDisconnect={onDisconnect} />
        ) : null}
      </ScrollView>
      {screen === "priority" || screen === "area" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Neue Aufgabe erfassen"
          onPress={() => setCapture(true)}
          style={[styles.capture, { bottom: 80 + insets.bottom }]}
        >
          <Icon name="add" color={colors.green} size={27} />
        </Pressable>
      ) : null}
      <View style={[styles.navigation, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {navigation.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: screen === item.id }}
            onPress={() => setScreen(item.id)}
            style={styles.navItem}
          >
            <View style={[styles.navIcon, screen === item.id && styles.navIconSelected]}>
              <Icon
                name={screen === item.id ? item.activeIcon : item.icon}
                size={21}
                color={screen === item.id ? colors.green : colors.muted}
              />
            </View>
            <Text
              style={[
                styles.navLabel,
                screen === item.id && { color: colors.green, fontWeight: "600" },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {capture ? (
        <CaptureSheet
          defaultArea={screen === "area" ? area : (settings?.defaultArea ?? "me")}
          onClose={() => setCapture(false)}
        />
      ) : null}
      {editing ? (
        <TaskEditor initialTask={editing} today={today} onClose={() => setEditing(null)} />
      ) : null}
    </SafeAreaView>
  );
}

class MobileBoundary extends Component<
  { children: ReactNode; onRetry: () => void; onDisconnect: () => Promise<void> },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SafeAreaView style={[base.screen, styles.center]}>
        <Icon name="cloud-offline-outline" color={colors.green} size={40} />
        <Text style={[base.title, { fontSize: 25, marginTop: 20 }]}>Kurz neu verbinden.</Text>
        <Text style={[base.subtitle, { textAlign: "center", marginBottom: 23 }]}>
          Die Aufgaben konnten nicht geladen werden. Prüfe die Verbindung oder erneuere den
          Gerätezugang.
        </Text>
        <Button onPress={this.props.onRetry}>Erneut laden</Button>
        <Button
          variant="ghost"
          onPress={() => {
            void this.props
              .onDisconnect()
              .catch(() =>
                Alert.alert("Gerät konnte nicht getrennt werden", "Bitte erneut versuchen."),
              );
          }}
        >
          Gerät trennen
        </Button>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  center: { justifyContent: "center", alignItems: "center", padding: 30 },
  logo: {
    width: 66,
    height: 66,
    borderRadius: 23,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 13,
    paddingBottom: 8,
  },
  miniLogo: {
    height: 26,
    width: 26,
    backgroundColor: colors.lime,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: { fontSize: 19, fontWeight: "700", letterSpacing: -1, color: colors.ink },
  date: { fontSize: 11, letterSpacing: 0.3, color: colors.muted },
  connectionDot: { width: 19, height: 20, alignItems: "center", justifyContent: "center" },
  connectedDot: { width: 6, height: 6, backgroundColor: "#8BAB73", borderRadius: 4 },
  todayCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.greenLight,
  },
  areas: { flexDirection: "row", gap: 6, marginTop: 23 },
  area: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 7,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: "#EEF1E8",
  },
  areaSelected: { backgroundColor: colors.paper, borderColor: "#BCCAAC" },
  areaName: { flex: 1, color: colors.muted, fontSize: 14 },
  areaCount: { color: colors.muted, fontSize: 11 },
  capture: {
    position: "absolute",
    right: 24,
    height: 57,
    width: 57,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.lime,
    boxShadow: "0 5px 15px #243b2525",
    borderWidth: 1,
    borderColor: "#C1D58C",
  },
  navigation: {
    flexDirection: "row",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4 },
  navIcon: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 },
  navIconSelected: { backgroundColor: colors.greenLight },
  navLabel: { fontSize: 10, color: colors.muted },
});
