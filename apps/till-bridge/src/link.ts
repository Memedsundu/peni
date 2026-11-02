import type { BridgePairedDTO, BridgePollDTO, BridgeProgressDTO, BridgeStatusDTO, TerminalResultDTO } from "@peni/api";
import type { Stage } from "./drivers/types";

/** Penny's side of the bridge, as the runner sees it. Tests put in their own. */
export interface PennyLink {
  pair(code: string, name: string): Promise<BridgePairedDTO>;
  /** Check in, and get the next job; waits on Penny's side a while when there's none. */
  poll(status: BridgeStatusDTO): Promise<BridgePollDTO>;
  progress(jobId: string, stage: Stage | null, message: string | null): Promise<BridgeProgressDTO>;
  result(jobId: string, result: TerminalResultDTO): Promise<{ ok: true }>;
}

/** Penny answered with an error. 401: this bridge isn't connected any more. */
export class LinkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const BRIDGE_HEADER = "x-penny-bridge-token";

/** Penny over HTTPS. Only ever calls out: no port is opened on the café's computer. */
export class HttpLink implements PennyLink {
  constructor(
    private readonly server: string,
    private readonly token: string | null,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  pair(code: string, name: string) {
    return this.call<BridgePairedDTO>("/bridge/pair", { code, name }, 20_000);
  }

  poll(status: BridgeStatusDTO) {
    // Penny holds a poll for up to 20 seconds when there's nothing to do.
    return this.call<BridgePollDTO>("/bridge/poll", { status }, 45_000);
  }

  progress(jobId: string, stage: Stage | null, message: string | null) {
    return this.call<BridgeProgressDTO>(`/bridge/jobs/${encodeURIComponent(jobId)}/progress`, { stage, message }, 10_000);
  }

  result(jobId: string, result: TerminalResultDTO) {
    return this.call<{ ok: true }>(`/bridge/jobs/${encodeURIComponent(jobId)}/result`, { result }, 20_000);
  }

  private async call<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const res = await this.fetcher(`${this.server.replace(/\/+$/, "")}/api/v1${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.token ? { [BRIDGE_HEADER]: this.token } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    if (!res.ok) throw new LinkError(res.status, json.error?.code ?? "HTTP", json.error?.message ?? `Penny answered ${res.status}`);
    return json as T;
  }
}
