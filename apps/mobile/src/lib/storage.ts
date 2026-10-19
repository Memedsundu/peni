import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** The session token and small preferences: the keychain on phones, localStorage on the web build. */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS !== "web") return SecureStore.getItemAsync(key);
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS !== "web") return SecureStore.setItemAsync(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS !== "web") return SecureStore.deleteItemAsync(key);
  try {
    localStorage.removeItem(key);
  } catch {}
}
