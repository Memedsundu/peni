import { createPeniClient, PeniApiError, type CustomerDTO, type PeniClient, type StaffCafeDTO } from "@peni/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { storage } from "./storage";

const TOKEN = "peni.token";
const STAFF = "peni.staffKey";
const STAFF_SLUG = "peni.staffSlug";
/** Where the Peni web server runs (see `.env.example`). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export interface Session {
  api: PeniClient;
  /** Stored credentials have been read (the root layout holds the splash until then). */
  ready: boolean;
  signedIn: boolean;
  /** Filled by sign-in, or from `GET /me` after a cold start. */
  customer: CustomerDTO | null;
  /** Cafés where this customer works [G19]; empty for everyone else. */
  staffCafes: StaffCafeDTO[];
  staffKey: string | null;
  /** The café Kafe modu runs for. */
  staffSlug: string | null;
  signIn: (token: string, customer: CustomerDTO, staffCafes?: StaffCafeDTO[]) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-reads `GET /me` (after a profile change). */
  refreshMe: () => Promise<void>;
  setStaffKey: (key: string | null) => Promise<void>;
  /** Stores (or forgets, with null) the staff key and the café it opens. */
  setStaff: (staff: { key: string; slug: string } | null) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

async function put(key: string, value: string | null) {
  try {
    if (value) await storage.set(key, value);
    else await storage.remove(key);
  } catch {
    // Keychain unavailable: the value lives for this session only.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [staffCafes, setStaffCafes] = useState<StaffCafeDTO[]>([]);
  const [staffKey, setStaffKeyState] = useState<string | null>(null);
  const [staffSlug, setStaffSlug] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const [t, k, s] = await Promise.all([TOKEN, STAFF, STAFF_SLUG].map((key) => storage.get(key).catch(() => null)));
      setToken(t ?? null);
      setStaffKeyState(k ?? null);
      setStaffSlug(s ?? null);
      setReady(true);
    })();
  }, []);

  const api = useMemo(
    () => createPeniClient({ baseUrl: API_URL, getToken: () => token, getStaffKey: () => staffKey }),
    [token, staffKey],
  );

  const signOut = useCallback(async () => {
    await put(TOKEN, null);
    setToken(null);
    setCustomer(null);
    setStaffCafes([]);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    try {
      const me = await api.me.get();
      setCustomer(me.customer);
      setStaffCafes(me.staffCafes);
    } catch (e) {
      if (e instanceof PeniApiError && e.status === 401) await signOut();
    }
  }, [api, token, signOut]);

  // Cold start with a stored token: fill in who is signed in.
  useEffect(() => {
    if (ready && token && !customer) void refreshMe();
  }, [ready, token, customer, refreshMe]);

  const signIn = useCallback(async (t: string, c: CustomerDTO, cafes?: StaffCafeDTO[]) => {
    await put(TOKEN, t);
    setToken(t);
    setCustomer(c);
    setStaffCafes(cafes ?? []);
  }, []);

  const setStaffKey = useCallback(async (key: string | null) => {
    await put(STAFF, key);
    setStaffKeyState(key);
  }, []);

  const setStaff = useCallback(async (staff: { key: string; slug: string } | null) => {
    await Promise.all([put(STAFF, staff?.key ?? null), put(STAFF_SLUG, staff?.slug ?? null)]);
    setStaffKeyState(staff?.key ?? null);
    setStaffSlug(staff?.slug ?? null);
  }, []);

  const value = useMemo<Session>(
    () => ({
      api,
      ready,
      signedIn: !!token,
      customer,
      staffCafes,
      staffKey,
      staffSlug,
      signIn,
      signOut,
      refreshMe,
      setStaffKey,
      setStaff,
    }),
    [api, ready, token, customer, staffCafes, staffKey, staffSlug, signIn, signOut, refreshMe, setStaffKey, setStaff],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
