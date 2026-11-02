import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IngenicoOptions } from "./drivers/ingenico";

/** The production address until Penny has its own domain. */
export const DEFAULT_SERVER = "https://peni-taupe.vercel.app";

export interface BridgeConfig {
  server: string;
  /** Penny's token for this bridge, from connecting with a code. Only on this computer. */
  token: string | null;
  /** For the status line: whose till this is. */
  cafe: string | null;
  device: string | null;
  driver: "simulator" | "ingenico";
  simulator: { speed?: number; paperOut?: boolean };
  ingenico: IngenicoOptions;
}

const DEFAULTS: BridgeConfig = {
  server: DEFAULT_SERVER,
  token: null,
  cafe: null,
  device: null,
  driver: "simulator",
  simulator: {},
  ingenico: { connection: "tcp" },
};

/** Where Penny Köprü keeps its settings, journal and the practice yazarkasa's slips. */
export function homeDir(): string {
  if (process.env.PENNY_KOPRU_HOME) return process.env.PENNY_KOPRU_HOME;
  return process.platform === "win32" ? join(process.env.APPDATA ?? homedir(), "PennyKopru") : join(homedir(), ".penny-kopru");
}

export function loadConfig(dir = homeDir()): BridgeConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) as Partial<BridgeConfig>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(config: BridgeConfig, dir = homeDir()): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "config.json");
  writeFileSync(`${file}.tmp`, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}
