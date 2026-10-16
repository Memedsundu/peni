import { createPeniClient, type CustomerDTO, type PeniClient } from "@peni/api";
import { storage } from "./storage";
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
      setToken(await storage.get(TOKEN));
      setStaffKeyState(await storage.get(STAFF));
      setReady(true);
    })();
  }, []);

  const api = useMemo(
    () => createPeniClient({ baseUrl: API_URL, getToken: () => token, getStaffKey: () => staffKey }),
    [token, staffKey],
  );

  const signIn = useCallback(async (t: string, c: CustomerDTO) => {
    await storage.set(TOKEN, t);
    setToken(t);
    setCustomer(c);
  }, []);

  const signOut = useCallback(async () => {
    await storage.remove(TOKEN);
    setToken(null);
    setCustomer(null);
  }, []);

  const setStaffKey = useCallback(async (key: string | null) => {
    if (key) await storage.set(STAFF, key);
    else await storage.remove(STAFF);
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
