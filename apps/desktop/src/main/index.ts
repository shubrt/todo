import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  safeStorage,
  screen,
  shell,
  systemPreferences,
  Tray,
  type IpcMainInvokeEvent,
} from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cloudUrlFromSite,
  createTokenProvider,
  loginDevice,
  NativeApiError,
  parseConnection,
  revokeDevice,
  type Connection,
  type TokenProvider,
} from "@todo/native-client";
import type {
  CreatedIntegrationKey,
  DesktopNavigation,
  DesktopPreferences,
  PublicDesktopState,
} from "../shared/contracts";
import { ConnectionStore } from "./connection-store";
import { LoginError, resolveSiteUrl, ShooLogin } from "./login";
import {
  isTrustedRenderer,
  validateClipboardText,
  validateKeyName,
  validateTokenOptions,
} from "./security";
import {
  defaultPreferences,
  loadPreferences,
  minimumSize,
  restoreBounds,
  validatePreferences,
  type Bounds,
} from "./window-state";

declare const __TODO_VARIANT__: string;
// Convex HTTP site from CONVEX_SITE_URL at build time ("" when unset). See scripts/build.mjs.
declare const __TODO_SITE_URL__: string;

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
// When showWindow last ran, so a desktop switch caused by showing can focus the window again.
// hideWindow resets it.
let shownAt = 0;
const shooLogin = new ShooLogin((url) => shell.openExternal(url));

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
    version: app.getVersion(),
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
      "Die gespeicherte Verbindung konnte nicht geöffnet werden. Entsperre den Schlüsselbund oder melde dich erneut an.";
  }

  if (process.platform === "darwin") app.dock?.hide();
  // The window is always black; dark keeps the traffic lights and native menus matching.
  nativeTheme.themeSource = "dark";
  const bounds = restoreBounds(
    savedBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  window = new BrowserWindow({
    ...bounds,
    minWidth: minimumSize.width,
    minHeight: minimumSize.height,
    maxWidth: 900,
    // A normal window, not type "panel": Electron's NSPanel forces it onto all Spaces, which
    // would make the "allSpaces" preference a no-op. Unlike a panel it activates todo when
    // shown, see hideWindow and refocusAfterSpaceSwitch.
    title: appName,
    // Native traffic lights inside the renderer's 40px title bar, which is the drag region.
    // Only close stays enabled (it hides): without a Dock tile a minimized window is lost.
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 14, y: 13 },
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: preferences.alwaysOnTop,
    skipTaskbar: true,
    acceptFirstMouse: true,
    backgroundColor: "#000000",
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
  // A reload drops the view that waits for the browser login, so cancel the login as well. Its
  // new client keeps the first token until shortly before expiry, so it gets a fresh one: a
  // cached token may belong to a key revoked since, which would fail every query.
  mainWindow.webContents.on("did-start-loading", () => {
    shooLogin.cancel();
    if (connection) tokenProvider = createTokenProvider(connection);
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      hideWindow();
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
      "Der globale Kurzbefehl ist bereits belegt. Wähle unter Einstellungen > Fenster einen anderen.";
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle(variant ? `✓ ${variant}` : "✓");
  tray.setToolTip(`${appName} · Deine Aufgaben im Blick`);
  tray.on("click", toggleWindow);
  if (process.platform === "darwin")
    systemPreferences.subscribeWorkspaceNotification(
      "NSWorkspaceActiveSpaceDidChangeNotification",
      refocusAfterSpaceSwitch,
    );
  updateMenu();
  registerIpc();
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(rendererFile);
}

function registerIpc() {
  handle("desktop:state", () => publicState());
  handle("desktop:login", async () => {
    try {
      const siteUrl = resolveSiteUrl(__TODO_SITE_URL__);
      return await shooLogin.run(siteUrl, async ({ code, codeVerifier }, checkCancelled) => {
        const device = await loginDevice(siteUrl, {
          code,
          codeVerifier,
          deviceName: `${appName} auf ${hostname()}`.slice(0, 80),
        });
        const candidate: Connection = { siteUrl, apiKey: device.key };
        try {
          const provider = createTokenProvider(candidate);
          if (!(await provider({ forceRefreshToken: true })))
            throw new LoginError(
              "Der neue Geräteschlüssel wurde nicht angenommen. Melde dich erneut an.",
            );
          // Last point to cancel: once the key is written, the login counts.
          checkCancelled();
          await store.write(JSON.stringify(candidate));
          const previous = connection;
          connection = candidate;
          tokenProvider = provider;
          stateError = undefined;
          // A replaced key would otherwise stay active and count toward the backend's key limit.
          if (previous && previous.apiKey !== candidate.apiKey)
            void revokeDevice(previous).catch(() => {});
          broadcast();
          return publicState();
        } catch (cause) {
          if (connection !== candidate) void revokeDevice(candidate).catch(() => {});
          throw cause;
        }
      });
    } catch (cause) {
      throw new Error(loginErrorMessage(cause));
    } finally {
      showWindow();
    }
  });
  // Step-up: an integration key needs a fresh Shoo login, so a stolen device key alone cannot
  // mint durable keys. The key goes to the renderer once and is neither logged nor stored here.
  handle("desktop:create-key", async (input) => {
    const name = validateKeyName(input);
    try {
      const siteUrl = resolveSiteUrl(__TODO_SITE_URL__);
      if (connection?.siteUrl !== siteUrl) throw new LoginError("Melde dich zuerst in todo an.");
      return await shooLogin.run(
        siteUrl,
        async ({ code, codeVerifier }, checkCancelled): Promise<CreatedIntegrationKey> => {
          const created = await loginDevice(siteUrl, {
            code,
            codeVerifier,
            deviceName: name,
            kind: "integration",
          });
          try {
            checkCancelled();
          } catch (cause) {
            // Nobody gets to see this key, so it must not stay active.
            void revokeDevice({ siteUrl, apiKey: created.key }).catch(() => {});
            throw cause;
          }
          return { id: created.id, name, prefix: created.prefix, key: created.key };
        },
      );
    } catch (cause) {
      throw new Error(loginErrorMessage(cause));
    } finally {
      showWindow();
    }
  });
  handle("desktop:cancel-login", () => {
    shooLogin.cancel();
  });
  handle("desktop:copy", async (input) => {
    await clipboard.writeText(validateClipboardText(input));
  });
  handle("desktop:disconnect", async () => {
    if (shooLogin.active) throw new Error("Warte, bis die Anmeldung abgeschlossen ist.");
    // Best effort: an unreachable backend must not keep the key on this Mac.
    if (connection) await revokeDevice(connection).catch(() => {});
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
        : "Der Geräteschlüssel ist abgelaufen oder wurde widerrufen. Melde dich erneut an.";
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
  handle("desktop:hide", hideWindow);
  // The picked emoji is typed into the focused field of the window.
  handle("desktop:emoji-panel", () => app.showEmojiPanel());
}

// Login and key creation errors shown in the window. NativeApiError messages are German and
// never echo a credential; for the login exchange they are the backend's own text, e.g. the
// missing SHOO_OWNER_SUBJECTS entry (403) or the 30-active-keys limit (400).
function loginErrorMessage(cause: unknown): string {
  if (cause instanceof LoginError || cause instanceof NativeApiError) return cause.message;
  if (cause instanceof Error && /Schlüsselbund/.test(cause.message)) return cause.message;
  return "Die Anmeldung ist fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut.";
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
    shownAt = Date.now();
    // Undo app.hide() from hideWindow first, otherwise the window shows without becoming key.
    if (process.platform === "darwin") app.show();
    window.show();
    window.focus();
  }
}
// Showing a window that sits on another desktop switches there, and macOS then activates the
// frontmost app of that desktop. Showing once more after the switch takes activation back
// (focus() alone would not steal it).
function refocusAfterSpaceSwitch() {
  if (window && Date.now() - shownAt < 1000) {
    shownAt = 0;
    window.show();
  }
}
// Showing activates todo, so hiding a focused window also hides the app on macOS. That hands
// keyboard focus back to the app used before instead of leaving todo active without a window.
function hideWindow() {
  if (!window) return;
  shownAt = 0;
  const focused = window.isFocused();
  window.hide();
  if (process.platform === "darwin" && focused) app.hide();
}
function toggleWindow() {
  if (window?.isVisible() && window.isFocused()) hideWindow();
  else showWindow();
}
function navigate(target: DesktopNavigation) {
  showWindow();
  window?.webContents.send("desktop:navigate", target);
}
// Tray checkboxes flip a preference; the debounced save writes it with the bounds.
function togglePreference(key: "alwaysOnTop" | "allSpaces") {
  preferences = { ...preferences, [key]: !preferences[key] };
  applyWindowPreferences();
  queueWindowSave();
  broadcast();
}

function updateMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Wichtig", click: () => navigate("important") },
      { label: "Verlauf", click: () => navigate("history") },
      { label: "Wiederholungen", click: () => navigate("recurrences") },
      { label: "Listen …", click: () => navigate("switcher") },
      { type: "separator" },
      {
        label: "Immer im Vordergrund",
        type: "checkbox",
        checked: preferences.alwaysOnTop,
        click: () => togglePreference("alwaysOnTop"),
      },
      {
        label: "Auf allen Schreibtischen",
        type: "checkbox",
        checked: preferences.allSpaces,
        click: () => togglePreference("allSpaces"),
      },
      { type: "separator" },
      // The dock icon is hidden, so this menu is the only native way into the settings.
      {
        label: "Einstellungen …",
        accelerator: "CommandOrControl+,",
        click: () => navigate("settings"),
      },
      { label: "Fenster ausblenden", click: hideWindow },
      { label: "Beenden", accelerator: "CommandOrControl+Q", click: () => app.quit() },
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
      // Dev runs only: DevTools, whose device mode emulates the touch layout.
      ...(app.isPackaged
        ? []
        : [{ label: "Darstellung", submenu: [{ role: "toggleDevTools" as const }] }]),
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
