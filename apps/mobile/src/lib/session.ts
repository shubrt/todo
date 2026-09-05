import * as SecureStore from "expo-secure-store";
import { parseConnection, type Connection } from "@todo/native-client";

const key = "todo-device-connection";
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function loadConnection(): Promise<Connection | null> {
  if (!(await SecureStore.isAvailableAsync())) return null;
  const value = await SecureStore.getItemAsync(key, options);
  if (!value) return null;
  try {
    return parseConnection(value);
  } catch {
    await SecureStore.deleteItemAsync(key, options);
    return null;
  }
}
export async function saveConnection(connection: Connection): Promise<void> {
  if (!(await SecureStore.isAvailableAsync())) throw new Error("Secure storage unavailable");
  await SecureStore.setItemAsync(key, JSON.stringify(connection), options);
}
export async function forgetConnection(): Promise<void> {
  if (await SecureStore.isAvailableAsync()) await SecureStore.deleteItemAsync(key, options);
}
