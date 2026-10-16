/**
 * Navigator options shared by the root stack, the tab stacks and the sheets (§8.4, §10.10).
 * Every value comes from the tokens; screens may still override per screen.
 */
import type { NativeStackNavigationOptions } from "expo-router";
import { fonts, headerType, radius, type Tokens } from "./theme";

/** Root-stack pushes and modals (café, order, giriş, masa kuralları): a plain paper header. */
export function rootStackOptions(t: Tokens): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: t.bg },
    headerTintColor: t.ink,
    headerTitleStyle: { ...headerType.title, color: t.ink },
    headerBackTitle: "Geri",
    headerBackTitleStyle: { fontFamily: fonts.sans },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: t.bg },
  };
}

/** Each customer tab's own Stack (§8.4 Headers): a Brygada large title over paper. */
export function tabStackOptions(t: Tokens): NativeStackNavigationOptions {
  return {
    ...rootStackOptions(t),
    headerLargeTitleEnabled: true,
    headerLargeTitleStyle: { ...headerType.largeTitle, color: t.ink },
    headerLargeStyle: { backgroundColor: t.bg },
    headerLargeTitleShadowVisible: false,
  };
}

/**
 * Staff tab stacks (§10.10): the press header, the same in both themes. The title, the tint
 * and the status bar stay light on press; the body is `bg`.
 */
export function staffStackOptions(t: Tokens): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: t.press },
    headerTintColor: t.onPress,
    headerTitleStyle: { ...headerType.title, color: t.onPress },
    headerUserInterfaceStyle: "dark",
    headerBackTitle: "Geri",
    headerBackTitleStyle: { fontFamily: fonts.sans },
    headerShadowVisible: false,
    headerLargeTitleEnabled: true,
    headerLargeTitleStyle: { ...headerType.largeTitle, color: t.onPress },
    headerLargeStyle: { backgroundColor: t.press },
    headerLargeTitleShadowVisible: false,
    contentStyle: { backgroundColor: t.bg },
  };
}

export type SheetDetents = NonNullable<NativeStackNavigationOptions["sheetAllowedDetents"]>;

/**
 * A native form sheet (§8.4 Sheets). The title goes inside the content, because Android has
 * no native header in a sheet. With `"fitToContents"` the content needs explicit heights,
 * never `flex: 1`.
 */
export function sheetOptions(t: Tokens, detents: SheetDetents): NativeStackNavigationOptions {
  return {
    presentation: "formSheet",
    headerShown: false,
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
    sheetAllowedDetents: detents,
    contentStyle: { backgroundColor: t.surface },
  };
}

export type SheetName =
  | "sepet"
  | "ismarla"
  | "askiya-birak"
  | "katil"
  | "askidan-al"
  | "iptal"
  | "reddet"
  | "durdur"
  | "kafe-modu";

/** §8.4 sheet table. */
export const SHEET_DETENTS: Record<SheetName, SheetDetents> = {
  sepet: [0.6, 1],
  ismarla: [0.6, 1],
  "askiya-birak": [0.75, 1],
  katil: "fitToContents",
  "askidan-al": "fitToContents",
  iptal: "fitToContents",
  reddet: "fitToContents",
  durdur: "fitToContents",
  "kafe-modu": "fitToContents",
};
