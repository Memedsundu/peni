/**
 * Mobile brand and signature components (design-system.md §6, §12.5). Every path and number
 * comes from @peni/brand; these files only render them with react-native-svg. Motifs are
 * decorative (hidden from readers) and always sit beside real text. Animations run on wrapping
 * `Animated.View`s, never on SVG props, and every one has its reduced-motion stand-in.
 *
 * Visual QA for every object, size and state: the `/kit-brand` route (dev builds, or
 * EXPO_PUBLIC_KIT=1).
 */
export { Amount, useLastSeenBalance, type AmountProps } from "./amount";
export { AskiCaption, AskiRail, askiRailProps, type AskiRailProps, type HangSignal } from "./aski-rail";
export { CafeCover, type CafeCoverCafe, type CafeCoverProps } from "./cafe-cover";
export { CafeHueBand, hueColor, plateRingStyle, type CafeHueBandProps } from "./cafe-hue-band";
export { Coin, type CoinCafe, type CoinProps } from "./coin";
export { CoinArt, type CoinArtProps } from "./coin-art";
export { DateBlock, type DateBlockProps } from "./date-block";
export { Fis, FisDivider, FisRow, FisText, useFisPaper, useFisPaperStyle, useFisTokens, type FisProps, type FisRowProps } from "./fis";
export { CoinGlyph, DeviceGlyph, HookGlyph, Manicule, SimitGlyph, TableGlyph, type GlyphProps } from "./glyphs";
export { HazirStamp, type HazirStampProps } from "./hazir-stamp";
export { LongTable, type LongTableProps } from "./long-table";
export { Masthead, type MastheadProps } from "./masthead";
export { InkRule, OxfordRule, type RuleProps } from "./rules";
export { StatusTrack, type StatusTrackOrder, type StatusTrackProps } from "./status-track";
