"use client";

import { Popover } from "@base-ui/react/popover";
import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { signInHref } from "@/components/auth/return-to";
import { Button, cx, Field, focusRing, Textarea, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import {
  COMMENT_MAX,
  intentChangesTable,
  MASA_INTENT_PARAM,
  masaMoreCopy,
  masaReturnTo,
  noteVouches,
  parseMasaIntent,
  sameFields,
  withOverlay,
  type IntentNote,
  type MasaIntent,
  type Overlay,
} from "./masa-model";

/*
 * Pieces the three Masa cards share: the act() wrapper (optimistic state, rollback, toast), the
 * way a signed-out action survives /giris, the in-place reveal, the answer / comment form and the
 * "join to take part" popover.
 */

/** The session is gone (or never was): the fix is to sign in. */
function isSignedOutError(e: unknown): boolean {
  return e instanceof PeniApiError && (e.status === 401 || e.code === "UNAUTHENTICATED");
}

/** Signed in, but not at this café's table: the fix is to join. */
function isNotMemberError(e: unknown): boolean {
  return e instanceof PeniApiError && e.code === "NOT_A_MEMBER";
}

function messageOf(e: unknown): string {
  if (e instanceof PeniApiError) return e.message || errorCopy.generic;
  return errorCopy.generic;
}

/** Keeps a control clear of the sticky header + section bar and of the bottom nav or cart bar when scrolled to. */
export const clearOfBars =
  "scroll-mt-[calc(var(--header-h)+var(--seg-h)+16px)] scroll-mb-[calc(var(--nav-h)+16px)] lg:scroll-mb-6";

/* ------------------------------------------------------------------- through sign-in */

const NOTE_KEY = "peni.masa.intent";
const DRAFT_KEY = "peni.masa.draft";

/**
 * Where "Giriş yap ve katıl" goes. The page uses the router; the kit (/kit/masa) provides a
 * function that logs the address instead, so its states can be reviewed without leaving.
 */
export const MasaSignInNavigate = createContext<((href: string) => void) | null>(null);

/**
 * Signed out: off to /giris with the way back to this card and the action to finish there
 * (`masaReturnTo`). The tab also keeps a short note of the action, which is what lets a seat or a
 * heart be replayed on return (`takeMasaIntent`).
 */
export function useSignInFor(): (intent: MasaIntent) => void {
  const { cafe } = useCafe();
  const router = useRouter();
  const navigate = useContext(MasaSignInNavigate);
  return useCallback(
    (intent: MasaIntent) => {
      try {
        const note: IntentNote = { ...intent, slug: cafe.slug, at: Date.now() };
        window.sessionStorage.setItem(NOTE_KEY, JSON.stringify(note));
      } catch {
        // Without the note a seat or a heart isn't replayed; the visitor still lands on the card.
      }
      const href = signInHref(masaReturnTo(cafe.slug, intent));
      if (navigate) navigate(href);
      else router.push(href);
    },
    [cafe.slug, router, navigate],
  );
}

/**
 * A Masa action that needs a member. Signed out: /giris, keeping the action (it is replayed on
 * return). Signed in but not a member: the join sheet, then `then`. A member: `then` at once.
 */
export function useJoinFor(): (intent: MasaIntent, then?: () => void) => void {
  const { signedIn, requireJoin } = useCafe();
  const signIn = useSignInFor();
  return useCallback(
    (intent: MasaIntent, then?: () => void) => {
      if (!signedIn) signIn(intent);
      else requireJoin(then);
    },
    [signedIn, requireJoin, signIn],
  );
}

/**
 * The action a visitor brought back from /giris (`?masa=rsvp:post_1`), read once: the marker
 * leaves the address bar, so a reload or a shared link doesn't replay it. A seat or a heart also
 * needs this tab's note (`intentChangesTable`).
 */
export function takeMasaIntent(slug: string): MasaIntent | null {
  if (typeof window === "undefined") return null;
  const here = new URL(window.location.href);
  const raw = here.searchParams.get(MASA_INTENT_PARAM);
  if (raw == null) return null;
  here.searchParams.delete(MASA_INTENT_PARAM);
  try {
    // `null`, not `history.state`: Next.js then copies its own entry state over and takes the new
    // address as its own, so a later router refresh doesn't write the marker back.
    window.history.replaceState(null, "", here.pathname + here.search + here.hash);
  } catch {
    // The marker stays in the address bar; harmless, it has been read (and a seat or a heart
    // isn't replayed twice: the tab's note went with the first read).
  }
  let note: IntentNote | null = null;
  try {
    note = JSON.parse(window.sessionStorage.getItem(NOTE_KEY) ?? "null") as IntentNote | null;
    window.sessionStorage.removeItem(NOTE_KEY);
  } catch {
    note = null;
  }
  const intent = parseMasaIntent(raw);
  if (!intent) return null;
  if (intentChangesTable(intent.kind) && !noteVouches(note, slug, intent, Date.now())) return null;
  return intent;
}

/** Keeps an unsent answer or comment while its writer signs in again. */
function keepDraft(postId: string, text: string) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ postId, text }));
  } catch {
    // The text is lost with the page; the field said why it couldn't be sent.
  }
}

function takeDraft(postId: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as { postId?: unknown; text?: unknown } | null;
    if (draft?.postId !== postId || typeof draft.text !== "string") return null;
    window.sessionStorage.removeItem(DRAFT_KEY);
    return draft.text.slice(0, COMMENT_MAX);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------ toggles */

/**
 * An optimistic toggle against one post (§9.3: heart, RSVP). `act(next, request)` shows `next`
 * at once and sends the request, one at a time. On success the café is re-read and the server's
 * picture takes over; on failure the old state comes back and `toast.error(message)` says why
 * (§9.3 "Errors from act()"). A missing membership opens the join sheet instead (`retry` runs
 * after a successful join); a lapsed session goes to /giris with `intent`, which is replayed.
 */
export function usePostToggle<T extends object>(server: T, intent: MasaIntent) {
  const { refresh, requireJoin } = useCafe();
  const signIn = useSignInFor();
  const [overlay, setOverlay] = useState<Overlay<T> | null>(null);
  // Once the server's picture has moved off the one the tap was made against, the overlay has
  // done its job. Dropped then, it can't mask a later return to those values (an undo made in
  // another tab), which would make the next tap flip the wrong way. While the server still shows
  // the old values (a re-read that failed), the overlay stays.
  if (overlay && !sameFields(overlay.base, server)) setOverlay(null);
  const inFlight = useRef(false);
  const shown = withOverlay(server, overlay);

  const act = useCallback(
    async (next: T, request: () => Promise<unknown>, retry?: () => void) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setOverlay({ base: server, value: next });
      try {
        await request();
        await refresh();
      } catch (e) {
        setOverlay(null);
        if (isSignedOutError(e)) signIn(intent);
        else if (isNotMemberError(e)) requireJoin(retry);
        else {
          toast.error(messageOf(e));
          // "Masa doldu": let the card catch up with the table it couldn't join.
          if (e instanceof PeniApiError && e.code === "EVENT_FULL") void refresh();
        }
      } finally {
        inFlight.current = false;
      }
    },
    [server, refresh, requireJoin, signIn, intent],
  );

  return { shown, act };
}

/**
 * Sends an answer or a comment. Not optimistic: the text stays in the field until the server
 * has it, and a failure is said under the field (the text is kept). A lapsed session keeps the
 * text for this tab and goes to /giris; back here, the field opens with it.
 */
export function useSendComment(intent: MasaIntent) {
  const { cafe, refresh, requireJoin } = useCafe();
  const signIn = useSignInFor();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || busy) return false;
      setBusy(true);
      setError(null);
      try {
        await peni.cafes.comment(cafe.slug, intent.postId, text);
        await refresh();
        return true;
      } catch (e) {
        if (isSignedOutError(e)) {
          keepDraft(intent.postId, body);
          signIn(intent);
        } else if (isNotMemberError(e)) requireJoin();
        else setError(messageOf(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, cafe.slug, intent, refresh, requireJoin, signIn],
  );

  return { send, busy, error, clearError: () => setError(null) };
}

/* ------------------------------------------------------------------------- layout */

/**
 * Brings `el` (with its scroll margins, see `clearOfBars`) into view once nothing holds the page
 * still: a closing sheet keeps the page's scroll locked until its exit has played (Base UI marks
 * `<html>` meanwhile), and an opening `Reveal` grows the page for 250ms, so it looks once more
 * after that. Does nothing when `el` is already in view. Returns a cancel function.
 */
export function revealSoon(el: HTMLElement | null): () => void {
  if (!el) return () => undefined;
  let frame = 0;
  let timer = 0;
  const started = performance.now();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const go = () => {
    if (el.isConnected) el.scrollIntoView({ block: "nearest", behavior: reduce ? "instant" : "smooth" });
  };
  const whenFree = () => {
    if (document.documentElement.hasAttribute("data-base-ui-scroll-locked") && performance.now() - started < 1500) {
      frame = window.requestAnimationFrame(whenFree);
      return;
    }
    go();
    timer = window.setTimeout(go, 300);
  };
  frame = window.requestAnimationFrame(whenFree);
  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}

/**
 * Opens or closes its content in place (the answers list, a post's comments). The height eases
 * where the browser has `interpolate-size: allow-keywords` (progressive enhancement); elsewhere,
 * and under reduced motion, it simply appears. Closed content is `inert`.
 */
export function Reveal({ open, id, children, className }: { open: boolean; id?: string; children: ReactNode; className?: string }) {
  // Clipped while closed and while easing; unclipped once open, so focus rings inside show.
  const [clip, setClip] = useState(!open);
  useEffect(() => {
    if (!open) {
      setClip(true);
      return;
    }
    const t = window.setTimeout(() => setClip(false), 260);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <div
      id={id}
      inert={!open}
      style={{ height: open ? "auto" : 0 }}
      className={cx(
        "[interpolate-size:allow-keywords] transition-[height] duration-250 ease-out-strong motion-reduce:transition-none",
        clip && "overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------------------- form */

/**
 * The answer / comment form: a labelled textarea (max 500) and "Gönder". Enter adds a line
 * (the keyboard shows its ordinary return key); Ctrl/⌘+Enter sends. Escape (or "Vazgeç", when
 * `onCancel` is given) closes it. "Gönder" with nothing typed says why under the field
 * (`emptyText`). `sentText` is read out once the server has the text (the field empties; the
 * new comment appears above it).
 */
export function CommentForm({
  intent,
  label,
  labelHidden = false,
  placeholder,
  autoFocus = false,
  emptyText,
  sentText,
  onSent,
  onCancel,
  className,
}: {
  /** The post, and what to finish here after a fresh sign-in ("cevap" or "yorum"). */
  intent: MasaIntent;
  label: string;
  /** When the control that opened the form already says `label` right above it. */
  labelHidden?: boolean;
  placeholder?: string;
  /** Focus the field and bring the whole form, buttons included, into view. */
  autoFocus?: boolean;
  emptyText: string;
  sentText?: string;
  onSent?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [empty, setEmpty] = useState(false);
  const [announce, setAnnounce] = useState("");
  const { send, busy, error, clearError } = useSendComment(intent);
  const area = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // Back from /giris after a lapsed session: the text that couldn't be sent.
  useEffect(() => {
    const draft = takeDraft(intent.postId);
    if (draft) setText(draft);
  }, [intent.postId]);

  useEffect(() => {
    if (!autoFocus) return;
    area.current?.focus({ preventScroll: true });
    return revealSoon(form.current);
  }, [autoFocus]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim()) {
      setEmpty(true);
      area.current?.focus();
      return;
    }
    if (await send(text)) {
      setText("");
      setEmpty(false);
      if (sentText) setAnnounce(sentText);
      onSent?.();
    }
  };

  return (
    <form ref={form} onSubmit={submit} noValidate className={cx("flex flex-col gap-3", clearOfBars, className)}>
      <Field
        label={label}
        labelHidden={labelHidden}
        error={error ?? (empty ? emptyText : null)}
        counter={text.length > COMMENT_MAX - 100 ? { length: text.length, max: COMMENT_MAX } : undefined}
      >
        <Textarea
          ref={area}
          value={text}
          maxLength={COMMENT_MAX}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            if (error) clearError();
            if (empty) setEmpty(false);
            if (announce) setAnnounce("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button variant="quiet" size="sm" onClick={onCancel} disabled={busy}>
            {actionCopy.cancel}
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy}>
          {masaMoreCopy.send}
        </Button>
      </div>
      {sentText && (
        <p role="status" className="sr-only">
          {announce}
        </p>
      )}
    </form>
  );
}

/* ----------------------------------------------------------------------- joining */

/** The join action's label: "Katıl" for members-to-be, "Giriş yap ve katıl" when signed out. */
export function useJoinLabel(short = "Katıl"): string {
  const { signedIn } = useCafe();
  return signedIn ? short : actionCopy.signInAndJoin;
}

/**
 * The non-member heart (§9.3): the trigger opens a small popover, "Kalp bırakmak için kafeye
 * katıl." + "Katıl". `onJoin` runs after the popover has closed.
 */
export function JoinPopover({
  trigger,
  triggerClassName,
  text,
  action,
  onJoin,
}: {
  trigger: ReactNode;
  triggerClassName: string;
  text: string;
  action: string;
  onJoin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const descId = useId();
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={triggerClassName}>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup
            aria-describedby={descId}
            className={cx(
              "flex w-[min(18rem,calc(100vw-32px))] origin-(--transform-origin) flex-col items-start gap-3 rounded-[14px] bg-surface p-4 text-ink shadow-floating outline-none",
              "transition-[opacity,scale] duration-200 ease-out-strong motion-reduce:duration-150",
              "data-starting-style:opacity-0 data-ending-style:opacity-0",
              "motion-safe:data-starting-style:scale-[.96] motion-safe:data-ending-style:scale-[.96]",
              focusRing,
            )}
          >
            <Popover.Description id={descId} className="text-body">
              {text}
            </Popover.Description>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
                onJoin();
              }}
            >
              {action}
            </Button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* -------------------------------------------------------------------------- focus */

/**
 * Keeps a keyboard-focused control clear of the sticky header + section bar above and the fixed
 * bottom nav (or cart bar) below (WCAG 2.2 2.4.11). After the browser has scrolled the control
 * into view, it checks what is actually drawn over the control's edge; if that is a fixed or
 * sticky bar, the page moves by the overlap plus 16px. Once `html` carries scroll-padding for
 * these bars, nothing overlaps and this does nothing.
 */
export function useFocusClearOfBars() {
  return useCallback((event: FocusEvent<HTMLElement>) => {
    const el = event.target;
    if (!(el instanceof HTMLElement) || !el.matches(":focus-visible")) return;
    window.requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      // The fixed or sticky bar drawn over the control at height y, if any.
      const barAt = (x: number, y: number): DOMRect | null => {
        if (y < 0 || y >= window.innerHeight) return null;
        const hit = document.elementFromPoint(x, y);
        if (!hit || el.contains(hit) || hit.contains(el)) return null;
        for (let n: Element | null = hit; n && n !== document.body; n = n.parentElement) {
          const position = getComputedStyle(n).position;
          if (position === "fixed" || position === "sticky") return n.getBoundingClientRect();
        }
        return null;
      };
      // Bars stack (the header, then the section bar under it), so look again after each move.
      for (let i = 0; i < 3; i++) {
        const r = el.getBoundingClientRect();
        const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 24), 0), window.innerWidth - 1);
        const cover = barAt(x, r.bottom - 2) ?? barAt(x, r.top + 2);
        if (!cover) return;
        // A bar in the lower half of the window is the bottom nav (or the cart bar): move the
        // page up until the control clears it. One in the upper half is the header: move it down.
        const lower = cover.top + cover.height / 2 > window.innerHeight / 2;
        window.scrollBy({ top: lower ? r.bottom - cover.top + 16 : -(cover.bottom - r.top + 16), behavior: "instant" });
      }
    });
  }, []);
}

/* -------------------------------------------------------------------------- files */

/** Hands the browser a file to save, as if a link with `download` had been followed. */
export function saveFile(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers read the blob after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
