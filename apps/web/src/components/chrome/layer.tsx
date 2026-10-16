"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * The phone floating-layer budget is one (design-system.md §8.2, D10): the bottom nav OR the
 * café cart bar, never both. The café page claims the layer for its CartBar as soon as the cart
 * has ≥1 item and hands it back when the cart empties; BottomNav slides away meanwhile (A4).
 */
export type FloatingLayer = "nav" | "cartbar";

interface LayerContextValue {
  floating: FloatingLayer;
  setFloating: (layer: FloatingLayer) => void;
}

const LayerContext = createContext<LayerContextValue>({ floating: "nav", setFloating: () => {} });

export function ChromeLayerProvider({ children }: { children: React.ReactNode }) {
  const [floating, setFloating] = useState<FloatingLayer>("nav");
  const value = useMemo(() => ({ floating, setFloating }), [floating]);
  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>;
}

/**
 * `const { setFloating } = useChromeLayer();` then `setFloating(cart.count > 0 ? "cartbar" : "nav")`
 * in an effect. A component that claimed "cartbar" gives the layer back to the nav automatically
 * when it unmounts, so leaving the café page can never strand the customer without navigation.
 */
export function useChromeLayer(): { floating: FloatingLayer; setFloating: (layer: FloatingLayer) => void } {
  const ctx = useContext(LayerContext);
  const { setFloating: set } = ctx;
  const claimed = useRef(false);

  const setFloating = useCallback(
    (layer: FloatingLayer) => {
      claimed.current = layer === "cartbar";
      set(layer);
    },
    [set],
  );

  useEffect(
    () => () => {
      if (claimed.current) {
        claimed.current = false;
        set("nav");
      }
    },
    [set],
  );

  return { floating: ctx.floating, setFloating };
}
