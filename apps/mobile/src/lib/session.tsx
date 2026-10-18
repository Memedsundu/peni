import { errorText, text, type Lang, type T } from "@peni/api/customer-text";
import { PeniApiError, type MeDTO, type SessionDTO } from "@peni/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken } from "./api";
import { deleteItem, getItem, setItem } from "./storage";

const TOKEN = "peni.token";
const LANG = "peni.lang";

interface Session {
  /** False until the stored token and language are read. */
  ready: boolean;
  me: MeDTO | null;
  lang: Lang;
  t: T;
  toggleLang: () => void;
  /** Turns a failed call into words for the screen. */
  error: (e: unknown) => string;
  /** Keeps the token from a sign-in. */
  signedIn: (session: SessionDTO) => Promise<void>;
  setMe: (me: MeDTO) => void;
  /** Signed in for the first time and hasn't said their name yet. [G8] */
  needsName: boolean;
  named: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeDTO | null>(null);
  const [lang, setLang] = useState<Lang>("tr");
  const [needsName, setNeedsName] = useState(false);

  useEffect(() => {
    void (async () => {
      if ((await getItem(LANG)) === "en") setLang("en");
      const token = await getItem(TOKEN);
      if (token) {
        setToken(token);
        try {
          setMe(await api.me.get());
        } catch (e) {
          // A session that ended is forgotten; being offline isn't a reason to sign out.
          if (e instanceof PeniApiError && e.status === 401) {
            setToken(null);
            await deleteItem(TOKEN);
          }
        }
      }
      setReady(true);
    })();
  }, []);

  const signedIn = useCallback(async (session: SessionDTO) => {
    setToken(session.token);
    await setItem(TOKEN, session.token);
    setMe({ customer: session.customer, staffCafes: session.staffCafes });
    setNeedsName(session.isNew);
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.signOut().catch(() => undefined);
    setToken(null);
    await deleteItem(TOKEN);
    setMe(null);
    setNeedsName(false);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === "tr" ? "en" : "tr";
      void setItem(LANG, next);
      return next;
    });
  }, []);

  const value = useMemo<Session>(
    () => ({ ready, me, lang, t: text(lang), toggleLang, error: (e) => errorText(e, lang), signedIn, setMe, needsName, named: () => setNeedsName(false), signOut }),
    [ready, me, lang, toggleLang, signedIn, needsName, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}
