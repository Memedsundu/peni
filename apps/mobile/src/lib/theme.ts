import { useColorScheme } from "react-native";

const light = {
  bg: "#faf6ef",
  surface: "#ffffff",
  surface2: "#f3ece1",
  ink: "#2b1d14",
  ink2: "#6b5847",
  line: "#e6dccd",
  copper: "#b5651d",
  copperInk: "#ffffff",
  copperSoft: "#f6e6d6",
  leaf: "#2f6b4f",
  leafSoft: "#e1efe7",
  berry: "#a3333d",
};

const dark: typeof light = {
  bg: "#17110d",
  surface: "#211812",
  surface2: "#2b2018",
  ink: "#f3e9dd",
  ink2: "#bba892",
  line: "#3a2d23",
  copper: "#e08a3c",
  copperInk: "#1a110b",
  copperSoft: "#3a2616",
  leaf: "#7fc4a0",
  leafSoft: "#1d3329",
  berry: "#f08a92",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

export const serif = { fontFamily: "Georgia", fontWeight: "700" as const };
