import { createPeniClient, type CustomerDTO, type PeniClient } from "@peni/api";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const TOKEN = "peni.token";
const STAFF = "peni.staffKey";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface Session {
  api: PeniClient;
  ready: boolean;
  signedIn: boolean;
  customer: CustomerDTO | null;
  staffKey: string | null;
  signIn: (token: string, customer: CustomerDTO) => Promise<void>;
  signOut: () => Promise<void>;
  setStaffKey: (key: string | null) => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerDTO | null>(null);
  const [staffKey, setStaffKeyState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      setToken(await SecureStore.getItemAsync(TOKEN));
      setStaffKeyState(await SecureStore.getItemAsync(STAFF));
      setReady(true);
    })();
  }, []);

  const api = useMemo(
    () => createPeniClient({ baseUrl: API_URL, getToken: () => token, getStaffKey: () => staffKey }),
    [token, staffKey],
  );

  const signIn = useCallback(async (t: string, c: CustomerDTO) => {
    await SecureStore.setItemAsync(TOKEN, t);
    setToken(t);
    setCustomer(c);
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN);
    setToken(null);
    setCustomer(null);
  }, []);

  const setStaffKey = useCallback(async (key: string | null) => {
    if (key) await SecureStore.setItemAsync(STAFF, key);
    else await SecureStore.deleteItemAsync(STAFF);
    setStaffKeyState(key);
  }, []);

  return (
    <SessionContext.Provider value={{ api, ready, signedIn: !!token, customer, staffKey, signIn, signOut, setStaffKey }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
