import { createPeniClient } from "@peni/api";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";

let token: string | null = null;

/** The customer's bearer token; the session keeps it in the keychain. */
export function setToken(next: string | null) {
  token = next;
}

/** Where the API lives. The web build talks to its own origin. */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

/** The public web address, for links people share (a treat's page). */
export const PUBLIC_URL = process.env.EXPO_PUBLIC_PUBLIC_URL || API_URL;

export const api = createPeniClient({ baseUrl: API_URL, getToken: () => token });

/** A QR from the customer screen: `https://…/p/<token>`. Returns the token, or null for anything else. */
export function claimTokenOf(scanned: string): string | null {
  const match = /\/p\/([A-Za-z0-9_-]{10,100})\/?(?:[?#].*)?$/.exec(scanned.trim());
  return match ? match[1]! : null;
}

/** Photos come as `/api/v1/images/<id>` from the server; the app needs the whole address. */
export function imageUri(url: string): string {
  return url.startsWith("/") ? `${API_URL}${url}` : url;
}

/** One key per action, so a retried tap does it once. */
export function newKey(): string {
  return Crypto.randomUUID();
}
