import { requireOptionalNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import type { Connection, HabitSnapshot } from "@todo/native-client";

export type SurfaceCapabilities = {
  nativeAvailable: boolean;
  widgets: boolean;
  liveActivities: boolean;
  ongoingNotification: boolean;
};

interface HabitSurfacesModule {
  configure(connection: Connection): Promise<string>;
  publish(snapshot: HabitSnapshot, generation: string): Promise<void>;
  refresh(): Promise<HabitSnapshot | null>;
  setNotificationEnabled(enabled: boolean): Promise<boolean>;
  startLiveActivity(): Promise<string | null>;
  endLiveActivity(): Promise<void>;
  requestPinWidget(): Promise<boolean>;
  clear(): Promise<void>;
  capabilities(): Promise<SurfaceCapabilities>;
}

const native =
  Platform.OS === "web"
    ? null
    : requireOptionalNativeModule<HabitSurfacesModule>("TodoHabitSurfaces");
function module(): HabitSurfacesModule {
  if (!native) throw new Error("Widgets benötigen den installierten Development Build dieser App.");
  return native;
}

export const configureSurfaces = (connection: Connection) => module().configure(connection);
export const publishSnapshot = (snapshot: HabitSnapshot, generation: string) =>
  module().publish(snapshot, generation);
export const refreshSurfaces = () => module().refresh();
export const startLiveActivity = () => module().startLiveActivity();
export const endLiveActivity = () => module().endLiveActivity();
export const requestPinWidget = () => module().requestPinWidget();
export async function clearSurfaces(): Promise<void> {
  await native?.clear();
}
export async function getSurfaceCapabilities(): Promise<SurfaceCapabilities> {
  return native
    ? native.capabilities()
    : { nativeAvailable: false, widgets: false, liveActivities: false, ongoingNotification: false };
}
export async function setNotificationEnabled(enabled: boolean): Promise<boolean> {
  if (enabled && Platform.OS === "android" && Number(Platform.Version) >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  return module().setNotificationEnabled(enabled);
}
