"use client";

import { PeniApiError, type TerminalDeviceDTO, type TerminalJobDTO, type TerminalSettingsDTO, type TerminalsPageDTO } from "@peni/api";
import { formatTL, formatTime } from "@peni/brand/format";
import { localDateKey } from "@peni/core";
import { useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Button, Notice } from "../../kasa/ui";
import { formatDay } from "../amounts";
import { Segmented, useSave } from "../controls";
import { field, PanelShell, type PanelProps } from "../shell";
import { errorText, fill } from "../text";

/** KDV rates in the order the café thinks of them. */
const RATES = ["10", "1", "20", "0"] as const;
/** How often the page looks again while a bridge is being connected or a report printed. */
const LOOK_MS = 3_000;

/**
 * Cihazlar (N12): the computers set up as a till, and the yazarkasa each one drives through
 * Penny Köprü. Connecting takes a one-time code typed into the bridge; then cash and card
 * sales go to the device by themselves, and it prints the fiscal receipt.
 */
export function Devices({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="cihazlar">
      {(p) => <DevicesPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function DevicesPage(p: PanelProps) {
  const { cafe, t, lang, signedOut } = p;
  const [page, setPage] = useState<TerminalsPageDTO | null>(null);
  const [codes, setCodes] = useState<Record<string, { code: string; expiresIso: string }>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.staff.terminals.get(cafe.slug).then(setPage, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafe.slug]);
  // While a code waits to be typed into a bridge, look again so the page turns to "Bağlı" by itself, with what the device said.
  const waiting = !!page?.devices.some((d) => d.bridge?.state === "waiting" || (d.bridge?.state === "online" && !d.bridge.status));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void load(), LOOK_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("navDevices")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("dvHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {page && page.devices.length === 0 && (
        <section className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
          <p className="leading-normal">{t("dvNone")}</p>
          <a href="/kasa" target="_blank" rel="noopener" className="font-semibold underline underline-offset-4">
            {t("dvOpenTill")}
          </a>
        </section>
      )}
      {page?.devices.map((d) => (
        <Device key={d.id} {...p} device={d} code={codes[d.id] ?? null} onPage={setPage} onCode={(c) => setCodes((all) => ({ ...all, [d.id]: c }))} />
      ))}
    </>
  );
}

function Device({
  cafe,
  t,
  lang,
  device,
  code,
  onPage,
  onCode,
}: PanelProps & {
  device: TerminalDeviceDTO;
  /** The code made on this visit; after a reload it's gone and a new one is needed. */
  code: { code: string; expiresIso: string } | null;
  onPage: (p: TerminalsPageDTO) => void;
  onCode: (c: { code: string; expiresIso: string }) => void;
}) {
  const b = device.bridge;
  const connect = useSave(lang, (r: Awaited<ReturnType<typeof api.staff.terminals.connect>>) => {
    onCode({ code: r.code, expiresIso: r.expiresIso });
    onPage(r.page);
  });
  const disconnect = useSave(lang, onPage);
  const [removing, setRemoving] = useState(false);
  const remove = useSave(lang, () => void api.staff.terminals.get(cafe.slug).then(onPage));

  return (
    <section className="flex flex-col gap-5 rounded-3xl border border-line p-5" aria-label={device.name}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-semibold">{device.name}</h2>
          <p className="text-sm text-muted">
            {fill(t("dvSetUp"), { day: formatDay(localDateKey(new Date(device.createdIso), "Europe/Istanbul"), lang) })}
            {device.lastSeenIso && ` · ${fill(t("dvLastUsed"), { time: formatTime(device.lastSeenIso) })}`}
          </p>
        </div>
        {removing ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t("dvRemoveSure")}</span>
            <Button kind="primary" size="sm" disabled={remove.busy} onClick={() => remove.run(() => api.staff.terminals.revokeDevice(cafe.slug, device.id))}>
              {t("dvRemoveYes")}
            </Button>
            <Button kind="bare" size="sm" onClick={() => setRemoving(false)}>
              {t("cancel")}
            </Button>
          </span>
        ) : (
          <Button kind="bare" size="sm" onClick={() => setRemoving(true)}>
            {t("dvRemove")}
          </Button>
        )}
      </div>
      {remove.error && <Notice tone="red">{remove.error}</Notice>}

      {!b ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
          <p className="leading-normal">{t("dvNoTerminal")}</p>
          <Button kind="primary" className="self-start" disabled={connect.busy} onClick={() => connect.run(() => api.staff.terminals.connect(cafe.slug, device.id))}>
            {t("dvConnect")}
          </Button>
          {connect.error && <Notice tone="red">{connect.error}</Notice>}
        </div>
      ) : b.state === "waiting" ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-panel p-5">
          {code ? (
            <>
              <p className="leading-normal">{t("dvCodeHelp")}</p>
              <p aria-label={code.code.split("").join(" ")} className="tabular font-mono text-5xl font-semibold tracking-[0.15em]">
                {code.code}
              </p>
              <p className="text-sm text-muted">{fill(t("dvCodeUntil"), { time: formatTime(code.expiresIso) })}</p>
            </>
          ) : (
            <p className="leading-normal">{fill(t("dvCodeLost"), { time: b.pairExpiresIso ? formatTime(b.pairExpiresIso) : "" })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={connect.busy} onClick={() => connect.run(() => api.staff.terminals.connect(cafe.slug, device.id))}>
              {t("dvNewCode")}
            </Button>
            <Button kind="bare" disabled={disconnect.busy} onClick={() => disconnect.run(() => api.staff.terminals.disconnect(cafe.slug, device.id))}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Connected cafe={cafe} t={t} lang={lang} device={device} onPage={onPage} onDisconnect={() => disconnect.run(() => api.staff.terminals.disconnect(cafe.slug, device.id))} />
      )}
      {disconnect.error && <Notice tone="red">{disconnect.error}</Notice>}
    </section>
  );
}

function Connected({
  cafe,
  t,
  lang,
  device,
  onPage,
  onDisconnect,
}: Pick<PanelProps, "cafe" | "t" | "lang"> & { device: TerminalDeviceDTO; onPage: (p: TerminalsPageDTO) => void; onDisconnect: () => void }) {
  const b = device.bridge!;
  const s = b.status;
  const online = b.state === "online";
  const [settings, setSettings] = useState<TerminalSettingsDTO & { enabled: boolean }>({ ...b.settings, enabled: b.enabled });
  const changed = JSON.stringify(settings) !== JSON.stringify({ ...b.settings, enabled: b.enabled });
  const save = useSave(lang, onPage);
  const departmentsOk = RATES.every((r) => Number.isInteger(settings.departments[r]) && settings.departments[r]! >= 1 && settings.departments[r]! <= 99);

  return (
    <div className="flex flex-col gap-5">
      <div className={`flex flex-col gap-1 rounded-3xl p-5 ${online ? "bg-panel" : "bg-red-soft"}`}>
        <p className={`flex items-center gap-2 text-lg font-semibold ${online ? "" : "text-red"}`}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green" : "bg-red"}`} />
          {online ? t("dvOnline") : fill(t("dvOffline"), { time: b.lastSeenIso ? formatTime(b.lastSeenIso) : "—" })}
        </p>
        <p className="text-sm text-muted">
          {[s?.driver === "simulator" ? t("dvSimulator") : s?.model, s?.serial, b.name, s?.version && `Penny Köprü ${s.version}`].filter(Boolean).join(" · ")}
        </p>
        {online && s?.message && <p className="text-sm font-semibold text-red">{s.message}</p>}
        {s?.driver === "simulator" && <p className="text-sm text-muted">{t("dvSimulatorHelp")}</p>}
      </div>

      {(device.today.printed > 0 || device.today.manual > 0) && (
        <p className="leading-normal">
          {fill(t("dvToday"), { n: device.today.printed })}
          {device.today.manual > 0 && <span className="font-semibold"> {fill(t("dvTodayManual"), { n: device.today.manual, tl: formatTL(device.today.manualKurus) })}</span>}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <Segmented
          label={t("dvSend")}
          value={settings.enabled ? "on" : "off"}
          onChange={(v) => setSettings({ ...settings, enabled: v === "on" })}
          options={[
            { value: "on", label: t("dvSendOn") },
            { value: "off", label: t("dvSendOff") },
          ]}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted">{t("dvDepartments")}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RATES.map((rate) => (
              <label key={rate} className="flex flex-col gap-1 text-sm text-muted">
                {fill(t("dvKdv"), { rate })}
                <input
                  className={`${field} min-h-12 tabular`}
                  inputMode="numeric"
                  value={settings.departments[rate] ?? ""}
                  onChange={(e) => setSettings({ ...settings, departments: { ...settings.departments, [rate]: Number(e.target.value.replace(/\D/g, "")) || 0 } })}
                />
              </label>
            ))}
          </div>
          <span className="text-xs leading-normal text-muted">{t("dvDepartmentsHelp")}</span>
        </fieldset>
        <Segmented
          label={t("dvPeni")}
          value={settings.peni}
          onChange={(v) => setSettings({ ...settings, peni: v })}
          options={[
            { value: "discount", label: t("dvAsDiscount") },
            { value: "payment", label: t("dvAsPayment") },
          ]}
        />
        <Segmented
          label={t("dvAskida")}
          value={settings.askida}
          onChange={(v) => setSettings({ ...settings, askida: v })}
          options={[
            { value: "discount", label: t("dvAsDiscount") },
            { value: "payment", label: t("dvAsPayment") },
          ]}
        />
        <p className="max-w-2xl text-xs leading-normal text-muted">{t("dvTreatmentHelp")}</p>
        {changed && (
          <Button
            kind="primary"
            className="self-start"
            disabled={save.busy || !departmentsOk}
            onClick={() => save.run(() => api.staff.terminals.saveSettings(cafe.slug, device.id, settings))}
          >
            {t("save")}
          </Button>
        )}
        {save.error && <Notice tone="red">{save.error}</Notice>}
      </section>

      <Tasks cafe={cafe} t={t} lang={lang} device={device} online={online} reports={!!s?.capabilities.reports} />

      <Button kind="bare" className="self-start" onClick={onDisconnect}>
        {t("dvDisconnect")}
      </Button>
    </div>
  );
}

/** "Deneme fişi", X and Z reports, and how the last ones went. */
function Tasks({
  cafe,
  t,
  lang,
  device,
  online,
  reports,
}: Pick<PanelProps, "cafe" | "t" | "lang"> & { device: TerminalDeviceDTO; online: boolean; reports: boolean }) {
  const [job, setJob] = useState<TerminalJobDTO | null>(null);
  const [confirmZ, setConfirmZ] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = !!job && (job.state === "queued" || job.state === "sent");
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => {
      api.staff.terminals.job(cafe.slug, job.id).then(setJob, (e: unknown) => setError(errorText(e, lang)));
    }, LOOK_MS / 2);
    return () => clearInterval(timer);
  }, [working, job?.id, cafe.slug, lang]);
  const start = (kind: "test" | "x" | "z") => {
    setConfirmZ(false);
    setError(null);
    api.staff.terminals.task(cafe.slug, device.id, { kind }).then(setJob, (e: unknown) => setError(errorText(e, lang)));
  };
  const past = device.bridge!.jobs.filter((j) => j.id !== job?.id);
  const label = (j: TerminalJobDTO) => (j.kind === "test" ? t("dvTest") : j.report === "z" ? t("dvZ") : t("dvX"));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm text-muted">{t("dvTasks")}</h3>
      {working ? (
        <p className="flex items-center gap-3" role="status">
          <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-chart-accent" />
          {fill(t("dvWorking"), { what: label(job) })}
        </p>
      ) : confirmZ ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">{t("dvZSure")}</span>
          <Button kind="primary" onClick={() => start("z")}>
            {t("dvZYes")}
          </Button>
          <Button kind="bare" onClick={() => setConfirmZ(false)}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button disabled={!online} onClick={() => start("test")}>
            {t("dvTest")}
          </Button>
          {reports && (
            <>
              <Button disabled={!online} onClick={() => start("x")}>
                {t("dvX")}
              </Button>
              <Button disabled={!online} onClick={() => setConfirmZ(true)}>
                {t("dvZ")}
              </Button>
            </>
          )}
        </div>
      )}
      {error && <Notice tone="red">{error}</Notice>}
      <ul className="flex flex-col">
        {[...(job && !working ? [job] : []), ...past].map((j) => (
          <li key={j.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft py-2 text-sm last:border-b-0">
            <span>
              {formatTime(j.createdIso)} · {label(j)}
              {j.z?.zNumber && ` · Z ${j.z.zNumber}`}
              {j.z?.totalKurus != null && ` · ${formatTL(j.z.totalKurus)}`}
            </span>
            <span className={j.outcome === "approved" ? "text-green" : j.outcome ? "text-red" : "text-muted"}>
              {j.outcome === "approved" ? t("dvDone") : j.outcome ? `${t("dvFailed")}${j.resultMessage ? `: ${j.resultMessage}` : ""}` : t("dvWaiting")}
            </span>
          </li>
        ))}
      </ul>
      {[job, ...past].some((j) => j?.report === "z" && j.outcome === "approved") && (
        <a href={`/panel/taslaklar?kafe=${encodeURIComponent(cafe.slug)}`} className="self-start text-sm font-semibold underline underline-offset-4">
          {t("dvZCheck")}
        </a>
      )}
    </section>
  );
}
