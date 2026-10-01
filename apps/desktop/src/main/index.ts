import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  Tray,
  type IpcMainInvokeEvent,
} from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloudUrlFromSite,
  createTokenProvider,
  parseConnection,
  type Connection,
  type TokenProvider,
} from "@todo/native-client";
import type { DesktopPreferences, DesktopView, PublicDesktopState } from "../shared/contracts";
import { ConnectionStore } from "./connection-store";
import { isTrustedRenderer, validateConnectionInput, validateTokenOptions } from "./security";
import {
  defaultPreferences,
  loadPreferences,
  restoreBounds,
  validatePreferences,
  type Bounds,
} from "./window-state";

declare const __TODO_VARIANT__: string;

// Dev runs and branch packages are variants with their own name, data directory, and instance lock.
const variant = __TODO_VARIANT__ || undefined;
const appName = variant ? `todo ${variant}` : "todo";
const directory = dirname(fileURLToPath(import.meta.url));
const rendererFile = join(directory, "renderer", "index.html");
const developmentUrl = !app.isPackaged ? process.env.TODO_DESKTOP_DEV_URL : undefined;
const devOrigin = developmentUrl ? new URL(developmentUrl).origin : undefined;
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let connection: Connection | null = null;
let tokenProvider: TokenProvider | null = null;
let preferences: DesktopPreferences = { ...defaultPreferences };
let savedBounds: Bounds | undefined;
let store: ConnectionStore;
let stateError: string | undefined;
let quitting = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let connecting = false;

app.setName(appName);
if (variant) app.setPath("userData", join(app.getPath("appData"), `todo-${variant}`));
// The dev script owns this process. Quit when it goes away, even after a hard kill.
if (developmentUrl) {
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) app.quit();
  }, 1000).unref();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
    globalShortcut.unregisterAll();
  });
  app.on("window-all-closed", () => {
    /* The menu bar keeps the companion available. */
  });
  void app
    .whenReady()
    .then(start)
    .catch(() => {
      console.error(JSON.stringify({ operation: "desktop.start", outcome: "error" }));
      app.quit();
    });
}

function publicState(): PublicDesktopState {
  return {
    configured: connection !== null,
    ...(variant ? { variant } : {}),
    ...(connection
      ? { siteUrl: connection.siteUrl, cloudUrl: cloudUrlFromSite(connection.siteUrl) }
      : {}),
    preferences: { ...preferences },
    ...(stateError ? { error: stateError } : {}),
  };
}

function broadcast() {
  window?.webContents.send("desktop:state-changed", publicState());
  updateMenu();
}

function assertSender(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !event.senderFrame ||
    !isTrustedRenderer(event.senderFrame.url, rendererFile, devOrigin)
  )
    throw new Error("Diese Anfrage ist nicht erlaubt.");
}

function handle(channel: string, handler: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    assertSender(event);
    return handler(...args);
  });
}

async function start() {
  const userData = app.getPath("userData");
  store = new ConnectionStore(join(userData, "connection.enc"), safeStorage);
  try {
    const settings = JSON.parse(await readFile(join(userData, "window.json"), "utf8")) as {
      preferences?: unknown;
      bounds?: Bounds;
    };
    preferences = loadPreferences(settings.preferences);
    savedBounds = settings.bounds;
  } catch {
    /* Missing or damaged window preferences use defaults. */
  }
  try {
    const encrypted = await store.read();
    if (encrypted) {
      connection = parseConnection(encrypted);
      tokenProvider = createTokenProvider(connection);
    }
  } catch {
    stateError =
      "Die gespeicherte Verbindung konnte nicht geöffnet werden. Entsperre den Schlüsselbund oder verbinde die App erneut.";
  }

  if (process.platform === "darwin") app.dock?.hide();
  const bounds = restoreBounds(
    savedBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  window = new BrowserWindow({
    ...bounds,
    minWidth: 340,
    minHeight: 360,
    maxWidth: 900,
    type: process.platform === "darwin" ? "panel" : undefined,
    title: appName,
    frame: false,
    roundedCorners: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: preferences.alwaysOnTop,
    skipTaskbar: true,
    acceptFirstMouse: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  const mainWindow = window;
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRenderer(url, rendererFile, devOrigin)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("move", queueWindowSave);
  mainWindow.on("resize", queueWindowSave);
  mainWindow.on("ready-to-show", () => {
    if (!app.getLoginItemSettings().wasOpenedAtLogin) mainWindow.show();
  });
  mainWindow.on("closed", () => {
    window = null;
  });
  screen.on("display-removed", () => {
    if (window)
      window.setBounds(
        restoreBounds(
          window.getBounds(),
          screen.getAllDisplays().map((display) => display.workArea),
        ),
      );
  });
  applyWindowPreferences();
  // Variants skip the startup shortcut so they never take it from the regular app.
  if (!variant && !globalShortcut.register(preferences.shortcut, toggleWindow))
    stateError =
      "Der globale Kurzbefehl ist bereits belegt. Wähle in den Fenstereinstellungen einen anderen.";
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(variant ? `✓ ${variant}` : "✓");
  tray.setToolTip(`${appName} · Deine Aufgaben im Blick`);
  tray.on("click", toggleWindow);
  updateMenu();
  registerIpc();
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(rendererFile);
}

function registerIpc() {
  handle("desktop:state", () => publicState());
  handle("desktop:connect", async (input) => {
    if (connecting) throw new Error("Eine Verbindung wird bereits geprüft.");
    connecting = true;
    try {
      const candidate = parseConnection(validateConnectionInput(input));
      const provider = createTokenProvider(candidate);
      const token = await provider({ forceRefreshToken: true });
      if (!token) throw new Error("Der Schlüssel ist ungültig oder wurde widerrufen.");
      await store.write(JSON.stringify(candidate));
      connection = candidate;
      tokenProvider = provider;
      stateError = undefined;
      broadcast();
      return publicState();
    } catch (cause) {
      if (
        cause instanceof Error &&
        /Schlüsselbund|Schlüssel ist ungültig|Verbindungsdaten|HTTPS|convex\.site|API-Schlüssel/.test(
          cause.message,
        )
      )
        throw cause;
      throw new Error(
        "Die Verbindung konnte nicht hergestellt werden. Prüfe URL, Schlüssel und deine Internetverbindung.",
      );
    } finally {
      connecting = false;
    }
  });
  handle("desktop:disconnect", async () => {
    if (connecting) throw new Error("Warte, bis die Verbindungsprüfung abgeschlossen ist.");
    await store.clear();
    connection = null;
    tokenProvider = null;
    stateError = undefined;
    await window?.webContents.session.clearStorageData();
    broadcast();
    return publicState();
  });
  handle("desktop:token", async (input) => {
    const options = validateTokenOptions(input);
    if (!tokenProvider) return null;
    try {
      const token = await tokenProvider(options);
      stateError = token
        ? undefined
        : "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Verbinde die App mit einem neuen Schlüssel.";
      if (!token) broadcast();
      return token;
    } catch {
      throw new Error("Die Aufgaben sind gerade nicht erreichbar. Prüfe deine Verbindung.");
    }
  });
  handle("desktop:preferences", async (input) => {
    const patch = validatePreferences(input);
    if (patch.launchAtLogin !== undefined && !app.isPackaged)
      throw new Error("Automatischer Start ist in der installierten App verfügbar.");
    const previous = preferences;
    let registeredShortcut: string | undefined;
    try {
      if (patch.shortcut && patch.shortcut !== preferences.shortcut) {
        if (!globalShortcut.register(patch.shortcut, toggleWindow))
          throw new Error("Dieser Kurzbefehl ist bereits belegt oder wird nicht unterstützt.");
        registeredShortcut = patch.shortcut;
      }
      if (patch.launchAtLogin !== undefined) {
        app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });
      }
      preferences = { ...preferences, ...patch };
      applyWindowPreferences();
      await persistWindow();
      if (registeredShortcut) globalShortcut.unregister(previous.shortcut);
      stateError = undefined;
      broadcast();
      return publicState();
    } catch (cause) {
      if (registeredShortcut) globalShortcut.unregister(registeredShortcut);
      preferences = previous;
      applyWindowPreferences();
      if (patch.launchAtLogin !== undefined)
        app.setLoginItemSettings({ openAtLogin: previous.launchAtLogin });
      throw cause;
    }
  });
  handle("desktop:hide", () => window?.hide());
}

function applyWindowPreferences() {
  window?.setAlwaysOnTop(preferences.alwaysOnTop, "floating");
  window?.setVisibleOnAllWorkspaces(preferences.allSpaces, {
    visibleOnFullScreen: preferences.allSpaces,
    skipTransformProcessType: true,
  });
}

function showWindow() {
  if (window) {
    window.show();
    window.focus();
  }
}
function toggleWindow() {
  if (window?.isVisible() && window.isFocused()) window.hide();
  else showWindow();
}
function navigate(view: DesktopView) {
  showWindow();
  window?.webContents.send("desktop:navigate", view);
}

function updateMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Aufgaben einblenden", accelerator: preferences.shortcut, click: showWindow },
      { type: "separator" },
      ...(["priority", "me", "agency", "work", "habits"] as const).map((view, index) => ({
        label: view === "priority" ? "Priorität" : view === "habits" ? "Habits" : view,
        accelerator: `CommandOrControl+${index + 1}`,
        click: () => navigate(view),
      })),
      { label: "Verlauf", click: () => navigate("history") },
      { type: "separator" },
      {
        label: "Immer im Vordergrund",
        type: "checkbox",
        checked: preferences.alwaysOnTop,
        click: () => {
          preferences.alwaysOnTop = !preferences.alwaysOnTop;
          applyWindowPreferences();
          void persistWindow();
          broadcast();
        },
      },
      {
        label: "Auf allen Schreibtischen",
        type: "checkbox",
        checked: preferences.allSpaces,
        click: () => {
          preferences.allSpaces = !preferences.allSpaces;
          applyWindowPreferences();
          void persistWindow();
          broadcast();
        },
      },
      { type: "separator" },
      { label: "Ausblenden", click: () => window?.hide() },
      { label: `${appName} beenden`, accelerator: "CommandOrControl+Q", click: () => app.quit() },
    ]),
  );
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: appName, submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] },
      {
        label: "Bearbeiten",
        submenu: [
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
    ]),
  );
}

function queueWindowSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistWindow().catch(() => {});
  }, 250);
}

async function persistWindow() {
  const directory = app.getPath("userData");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(
    join(directory, "window.json"),
    JSON.stringify({ preferences, bounds: window?.getBounds() ?? savedBounds }),
    { mode: 0o600 },
  );
}
