import type { CafeHue } from "@peni/api";
import { useColorScheme } from "react-native";

/** The web's tokens (apps/web globals.css), light and dark. */
const LIGHT = {
  ink: "#111111",
  paper: "#ffffff",
  panel: "#fafaf8",
  tile: "#eeeeea",
  line: "#e6e6e6",
  lineSoft: "#ecece8",
  muted: "#5c5c5c",
  green: "#1e4d3b",
  greenSoft: "#e8efeb",
  red: "#a3342b",
  redSoft: "#f7e9e7",
};
const DARK: typeof LIGHT = {
  ink: "#f2f2ee",
  paper: "#111111",
  panel: "#171716",
  tile: "#242422",
  line: "#2c2c2a",
  lineSoft: "#232321",
  muted: "#a3a3a0",
  green: "#8cc4a6",
  greenSoft: "#1b2a22",
  red: "#e59a91",
  redSoft: "#2e1c1a",
};

/** Each café's own colour on its pages; Peni's green when it hasn't picked one. */
const HUES: Record<CafeHue | "peni", { light: string; dark: string }> = {
  peni: { light: "#1e4d3b", dark: "#8cc4a6" },
  zeytin: { light: "#55602f", dark: "#b9c48a" },
  lacivert: { light: "#1f3a5f", dark: "#9db8dc" },
  murekkep: { light: "#2b2f4a", dark: "#b3b7d6" },
  patlican: { light: "#4a2740", dark: "#d2a6c5" },
};

export type Colors = typeof LIGHT & { cafe: string; dark: boolean };

export function useColors(hue: CafeHue | null = null): Colors {
  const dark = useColorScheme() === "dark";
  const base = dark ? DARK : LIGHT;
  const colour = HUES[hue ?? "peni"];
  return { ...base, cafe: dark ? colour.dark : colour.light, dark };
}

export const FONTS = {
  sans: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  serif: "InstrumentSerif_400Regular",
};
