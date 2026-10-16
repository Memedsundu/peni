"use client";

import type { OrderDTO, PauseDuration } from "@peni/api";
import { errorCopy, staffCopy, withoutRetry } from "@peni/brand/copy";
import { CirclePause, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePress } from "@/components/chrome/press-header";
import { Banner, Button, Segmented, Skeleton, segmentedPanelId, segmentedTabId, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { BoardSkeleton, StaffBoard } from "./board";
import { StaffGate } from "./gate";
import { boardColumns, pausedBannerText } from "./model";
import { PauseSheet, useNow } from "./pause-sheet";
import { RejectSheet } from "./reject-sheet";
import { ReportList, ReportSkeleton } from "./report-list";
import { ShiftStart } from "./shift-start";
import { audioReady, playChime, unlockAudio } from "./sound";
import { NEW_BAR_MS } from "./ticket";
import { TillPanel, TillSkeleton } from "./till-panel";
import { useBumps, useStaffDashboard } from "./use-board";
import { requestWakeLock, useWakeLock } from "./wake-lock";

type Section = "tezgah" | "aski" | "rapor";
const SECTIONS: readonly Section[] = ["tezgah", "aski", "rapor"];
const SECTION_SEG = "kafe-bolum";

/**
 * Café panel `/kafe/[slug]` (design-system.md §9.10, §8.3). Inside the PressShell:
 * the gate while no key is stored; then the shift-start card (once per tab), the persistent
 * banners (sound off, paused, connection), the "Tezgâh · Askı · Rapor" sections and their
 * content, polled every 4s while the tab is visible.
 */
export function StaffPanel() {
  const { keyed } = usePress();
  const [notice, setNotice] = useState<string | null>(null);
  // The "Anahtar tutmadı." notice is for the gate right after a rejected key, not for a later
  // "Çıkış" once a key has worked again.
  if (keyed && notice !== null) setNotice(null);

  if (keyed === null) return <PanelSkeleton />;
  if (!keyed) return <StaffGate notice={notice} />;
  return <Panel onKeyRejected={() => setNotice(errorCopy.staffKey)} />;
}

function shiftKey(slug: string) {
  return `peni.shift.${slug}`;
}

function readShift(slug: string): "started" | "dismissed" | null {
  try {
    const v = sessionStorage.getItem(shiftKey(slug));
    return v === "started" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}

function writeShift(slug: string, v: "started" | "dismissed") {
  try {
    sessionStorage.setItem(shiftKey(slug), v);
  } catch {
    // Private mode: the card shows again on the next load.
  }
}

function sectionFromHash(): Section {
  const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return (SECTIONS as readonly string[]).includes(h) ? (h as Section) : "tezgah";
}

function Panel({ onKeyRejected }: { onKeyRejected: () => void }) {
  const press = usePress();
  const { slug, cafeName, hue, signOut, report, setPauseHandler, soundOn, audible, turnSoundOn, setSoundOn } = press;

  const onUnauthorized = useCallback(() => {
    onKeyRejected();
    signOut();
  }, [onKeyRejected, signOut]);

  const board = useStaffDashboard(slug, true, onUnauthorized);
  const bumps = useBumps(slug, board);
  const { data } = board;
  const now = useNow(10_000);

  /* ---------------- sections (kept in the hash, so a reload stays put) ---------------- */
  const [section, setSection] = useState<Section>("tezgah");
  useEffect(() => setSection(sectionFromHash()), []);
  const changeSection = (id: string) => {
    const next = id as Section;
    setSection(next);
    try {
      history.replaceState(null, "", next === "tezgah" ? window.location.pathname : `#${next}`);
    } catch {
      // Sandboxed frames: the section just isn't remembered.
    }
  };

  /* ---------------- shift start: sound + wake lock ---------------- */
  const [shift, setShift] = useState<"pending" | "started" | "dismissed" | null>(null);
  useEffect(() => setShift(readShift(slug) ?? "pending"), [slug]);
  useWakeLock(true);

  const startShift = () => {
    // Inside the click: browsers allow sound (and Safari the wake lock) only from a gesture.
    void unlockAudio().then((ok) => ok && playChime());
    void requestWakeLock();
    setSoundOn(true);
    writeShift(slug, "started");
    setShift("started");
  };
  const dismissShift = () => {
    setSoundOn(false);
    writeShift(slug, "dismissed");
    setShift("dismissed");
  };

  // After a reload the card doesn't come back: the first tap anywhere wakes the sound again.
  // Browsers only let audio start on an activation (pointerup, touchend, click, keydown), never on
  // pointerdown, so a tablet's first tap needs those.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    const onGesture = () => {
      if (soundOnRef.current && !audioReady()) void unlockAudio();
      void requestWakeLock();
    };
    for (const e of events) window.addEventListener(e, onGesture, true);
    return () => {
      for (const e of events) window.removeEventListener(e, onGesture, true);
    };
  }, []);

  /* ---------------- pause: header pill → sheet ---------------- */
  const [pauseOpen, setPauseOpen] = useState(false);
  useEffect(() => {
    setPauseHandler(() => setPauseOpen(true));
    return () => setPauseHandler(null);
  }, [setPauseHandler]);
  useEffect(() => {
    if (data) report({ paused: data.cafe.appOrderingPaused, pausedUntil: data.cafe.pausedUntil });
  }, [data, report]);
  useEffect(() => () => report(null), [report]);

  const choosePause = async (value: PauseDuration | null) => {
    try {
      const r = await peni.staff.setPaused(slug, value);
      board.touch();
      board.patch((d) => ({ ...d, cafe: { ...d.cafe, appOrderingPaused: r.appOrderingPaused, pausedUntil: r.pausedUntil } }));
    } catch (e) {
      toast.error(errorCopy.change);
      throw e;
    }
  };
  const [resuming, setResuming] = useState(false);
  const resumeNow = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      await choosePause(null);
    } catch {
      // toasted
    } finally {
      setResuming(false);
    }
  };

  /* ---------------- new orders: chime, A13 bar, document title ---------------- */
  const seen = useRef<Set<string> | null>(null);
  const [arrivals, setArrivals] = useState<ReadonlyMap<string, number>>(() => new Map());
  useEffect(() => {
    if (!data) return;
    const ids = data.orders.map((o) => o.id);
    if (!seen.current) {
      seen.current = new Set(ids); // the first board is not "new"
      return;
    }
    const fresh = data.orders.filter((o) => o.status === "submitted" && !seen.current!.has(o.id));
    for (const id of ids) seen.current.add(id);
    if (fresh.length === 0) return;
    if (soundOnRef.current) playChime();
    const at = Date.now();
    setArrivals((prev) => {
      const next = new Map(prev);
      for (const o of fresh) next.set(o.id, at);
      return next;
    });
  }, [data]);
  // Forget arrivals once their bar has faded.
  useEffect(() => {
    if (arrivals.size === 0) return;
    const id = window.setTimeout(() => {
      const cutoff = Date.now() - NEW_BAR_MS - 1_000;
      setArrivals((prev) => new Map([...prev].filter(([, at]) => at > cutoff)));
    }, NEW_BAR_MS + 1_200);
    return () => window.clearTimeout(id);
  }, [arrivals]);

  const columns = useMemo(() => boardColumns(data?.orders ?? [], bumps.overrides), [data, bumps.overrides]);
  const newCount = columns.submitted.length;

  const baseTitle = useRef<string | null>(null);
  useEffect(() => {
    baseTitle.current ??= document.title;
    document.title = newCount > 0 ? staffCopy.newOrdersTitle(newCount) : baseTitle.current;
  }, [newCount]);
  useEffect(
    () => () => {
      if (baseTitle.current) document.title = baseTitle.current;
    },
    [],
  );

  /* ---------------- reject ---------------- */
  const [rejecting, setRejecting] = useState<OrderDTO | null>(null);

  /* ---------------- render ---------------- */
  const paused = data?.cafe.appOrderingPaused ?? false;
  const showSoundBanner = (shift === "started" || shift === "dismissed") && !audible;
  const sectionLabel = staffCopy.sections[section];

  return (
    <>
      <h1 className="sr-only">
        {cafeName} · {sectionLabel}
      </h1>

      {(showSoundBanner || paused || board.error) && (
        <div className="flex flex-col gap-2 pt-4">
          {board.error && (
            <Banner
              tone="danger"
              compact
              title={withoutRetry(board.error)}
              action={
                <Button variant="secondary" size="sm" onClick={() => void board.refresh()}>
                  {errorCopy.retry}
                </Button>
              }
            >
              {data ? staffCopy.staleBoard : null}
            </Banner>
          )}
          {paused && data && (
            <Banner
              tone="warning"
              compact
              icon={CirclePause}
              title={pausedBannerText(data.cafe.pausedUntil, Math.max(now, Date.now()))}
              action={
                <Button size="sm" loading={resuming} loadingLabel={staffCopy.resume} onClick={() => void resumeNow()}>
                  {staffCopy.resume}
                </Button>
              }
            />
          )}
          {showSoundBanner && (
            <Banner
              tone="warning"
              compact
              icon={VolumeX}
              title={staffCopy.soundOffBanner}
              action={
                <Button variant="secondary" size="sm" onClick={turnSoundOn}>
                  {staffCopy.soundOffAction}
                </Button>
              }
            />
          )}
        </div>
      )}

      <div className="mt-2 md:sticky md:top-(--header-h) md:z-20 md:-mx-6 md:px-6 md:[background:var(--grain),var(--bg)] lg:-mx-8 lg:px-8">
        <Segmented
          id={SECTION_SEG}
          label={cafeName}
          items={[
            { id: "tezgah", label: staffCopy.sections.tezgah, count: newCount > 0 ? newCount : undefined },
            { id: "aski", label: staffCopy.sections.aski },
            { id: "rapor", label: staffCopy.sections.rapor },
          ]}
          value={section}
          onChange={changeSection}
          controlsPanels
          className="md:max-w-[480px]"
        />
      </div>

      <div
        id={segmentedPanelId(SECTION_SEG, section)}
        role="tabpanel"
        aria-labelledby={segmentedTabId(SECTION_SEG, section)}
        aria-busy={board.loading || undefined}
        // The sticky section bar's height: the board's column headers stick just under it.
        className="pt-4 md:pt-6 md:[--section-bar-h:3rem]"
      >
        {/* Until there is a board (loading, or a first load that failed under its banner) the
            section keeps its shape: the skeleton holds the place of what will come. */}
        {section === "tezgah" &&
          (data ? (
            <StaffBoard
              columns={columns}
              slug={slug}
              hue={hue}
              posKind={data.cafe.posKind}
              now={now}
              arrivals={arrivals}
              onBump={bumps.bump}
              onReject={setRejecting}
            />
          ) : (
            <BoardSkeleton />
          ))}
        {section === "aski" &&
          (data ? (
            <TillPanel
              slug={slug}
              askida={data.askida}
              onDonated={(next) => {
                board.touch();
                board.patch((d) => ({
                  ...d,
                  askida: {
                    ...d.askida,
                    balancePeni: next.balancePeni,
                    itemsAvailable: next.itemsAvailable,
                    donatedLast7DaysPeni: d.askida.donatedLast7DaysPeni + next.donatedPeni,
                  },
                }));
              }}
            />
          ) : (
            <TillSkeleton />
          ))}
        {section === "rapor" && (data ? <ReportList data={data} /> : <ReportSkeleton />)}
      </div>

      <ShiftStart open={shift === "pending" && data != null} onStart={startShift} onDismiss={dismissShift} />
      <PauseSheet open={pauseOpen} onOpenChange={setPauseOpen} pause={press.pause} onChoose={choosePause} />
      <RejectSheet order={rejecting} onOpenChange={(open) => !open && setRejecting(null)} onReject={bumps.reject} />
    </>
  );
}

/** Before the first client render we don't know whether a key is stored: the board's outline. */
function PanelSkeleton() {
  return (
    <div aria-hidden className="pt-6">
      <div className="flex h-12 items-center gap-8 shadow-[inset_0_-1px_0_var(--line)] md:max-w-[480px]">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="pt-4 md:pt-6">
        <BoardSkeleton />
      </div>
    </div>
  );
}
