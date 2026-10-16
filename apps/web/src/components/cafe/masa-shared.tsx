"use client";

import { Popover } from "@base-ui/react/popover";
import { PeniApiError } from "@peni/api";
import { actionCopy, errorCopy } from "@peni/brand/copy";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button, cx, Field, focusRing, Textarea, toast } from "@/components/ui";
import { peni } from "@/lib/client";
import { useCafe } from "./cafe-context";
import { COMMENT_MAX, masaMoreCopy, withOverlay, type Overlay } from "./masa-model";

/*
 * Pieces the three Masa cards share: the act() wrapper (optimistic state, rollback, toast), the
 * in-place reveal, the answer / comment form and the "join to take part" popover.
 */

/** Errors whose fix is to join (or sign in), not to read a message. */
function needsJoin(e: unknown): boolean {
  return e instanceof PeniApiError && (e.status === 401 || e.code === "NOT_A_MEMBER" || e.code === "UNAUTHENTICATED");
}

function messageOf(e: unknown): string {
  if (e instanceof PeniApiError) return e.message || errorCopy.generic;
  return errorCopy.generic;
}

/**
 * An optimistic toggle against one post (§9.3: heart, RSVP). `act(next, request)` shows `next`
 * at once and sends the request, one at a time. On success the café is re-read and the server's
 * picture takes over; on failure the old state comes back and `toast.error(message)` says why
 * (§9.3 "Errors from act()"). A missing membership opens the join sheet instead, and `retry`
 * runs after a successful join.
 */
export function usePostToggle<T extends object>(server: T) {
  const { refresh, requireJoin } = useCafe();
  const [overlay, setOverlay] = useState<Overlay<T> | null>(null);
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
        if (needsJoin(e)) requireJoin(retry);
        else {
          toast.error(messageOf(e));
          // "Masa doldu": let the card catch up with the table it couldn't join.
          if (e instanceof PeniApiError && e.code === "EVENT_FULL") void refresh();
        }
      } finally {
        inFlight.current = false;
      }
    },
    [server, refresh, requireJoin],
  );

  return { shown, act };
}

/**
 * Sends an answer or a comment. Not optimistic: the text stays in the field until the server
 * has it, and a failure is said under the field (the text is kept).
 */
export function useSendComment(postId: string) {
  const { cafe, refresh, requireJoin } = useCafe();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      const text = body.trim();
      if (!text || busy) return false;
      setBusy(true);
      setError(null);
      try {
        await peni.cafes.comment(cafe.slug, postId, text);
        await refresh();
        return true;
      } catch (e) {
        if (needsJoin(e)) requireJoin();
        else setError(messageOf(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, cafe.slug, postId, refresh, requireJoin],
  );

  return { send, busy, error, clearError: () => setError(null) };
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

/**
 * The answer / comment form: a labelled textarea (max 500) and "Gönder". Enter adds a line;
 * Ctrl/⌘+Enter sends. Escape (or "Vazgeç", when `onCancel` is given) closes it.
 */
export function CommentForm({
  postId,
  label,
  labelHidden = false,
  placeholder,
  autoFocus = false,
  onSent,
  onCancel,
  className,
}: {
  postId: string;
  label: string;
  /** When the control that opened the form already says `label` right above it. */
  labelHidden?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onSent?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const { send, busy, error, clearError } = useSendComment(postId);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) area.current?.focus({ preventScroll: false });
  }, [autoFocus]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    // Nothing to send yet: back to the field (the button stays enabled, so it never needs a reason).
    if (!text.trim()) {
      area.current?.focus();
      return;
    }
    if (await send(text)) {
      setText("");
      onSent?.();
    }
  };

  return (
    <form onSubmit={submit} className={cx("flex flex-col gap-3", className)}>
      <Field label={label} labelHidden={labelHidden} error={error} counter={text.length > COMMENT_MAX - 100 ? { length: text.length, max: COMMENT_MAX } : undefined}>
        <Textarea
          ref={area}
          value={text}
          maxLength={COMMENT_MAX}
          placeholder={placeholder}
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            if (error) clearError();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
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
    </form>
  );
}

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
