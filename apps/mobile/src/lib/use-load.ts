import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/** Loads on focus, optionally polls while focused. */
export function useLoad<T>(load: () => Promise<T>, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (!pollMs) return;
      const t = setInterval(refresh, pollMs);
      return () => clearInterval(t);
    }, [refresh, pollMs]),
  );

  return { data, error, loading, refresh };
}
