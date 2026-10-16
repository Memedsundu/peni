"use client";

import { Menu } from "@base-ui/react/menu";
import { actionCopy, errorCopy, peniCopy } from "@peni/brand/copy";
import { initials } from "@peni/brand/format";
import { LogOut, QrCode, UserRound } from "lucide-react";
import * as m from "motion/react-m";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { signOut as endSession } from "@/lib/client";
import { spring } from "@/lib/motion";
import { ActiveOrderChip, useActiveOrderChipVisible } from "./active-order-chip";
import { NAV_ITEMS, navKeyFor } from "./nav-items";
import { usePeniKodu } from "./peni-kodu";
import { useChromeSession } from "./session";
import { Wordmark } from "./wordmark";

/** A1 press, with the reduced-motion fallback (no scale; the fill steps instead). */
const press =
  "transition-[scale,background-color] duration-150 ease-out-strong active:scale-[.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * Customer top bar (design-system.md §8.2). Sticky, solid `bg`, bottom `line`, and the
 * `site-header` view-transition name so it stays put while a café cover morphs (A16).
 *
 * ≥768 (64px): wordmark · "Kafeler  Siparişlerim  Cüzdan" · chip, "Peni kodum", avatar menu.
 * <768 (56px): wordmark · chip and a 44px "Peni kodum" icon button. The bottom nav does the rest.
 * Customers never see a staff link here (§8.1).
 */
export function TopBar() {
  const pathname = usePathname();
  const chipVisible = useActiveOrderChipVisible();

  return (
    <header
      style={{ viewTransitionName: "site-header" }}
      className="sticky top-0 z-30 border-b border-line bg-bg"
    >
      <div className="mx-auto grid h-[var(--header-h)] max-w-[1120px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr] lg:px-8">
        <div className="flex min-w-0 items-center">
          <Wordmark compact={chipVisible} />
        </div>
        <TopNav pathname={pathname} />
        <div className="flex items-center justify-end gap-2">
          <ActiveOrderChip />
          <PeniKoduButton />
          <AccountButton pathname={pathname} />
        </div>
      </div>
    </header>
  );
}

function TopNav({ pathname }: { pathname: string }) {
  const current = navKeyFor(pathname);
  return (
    <nav aria-label="Ana menü" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.filter((i) => i.topLabel).map((item) => {
          const active = item.key === current;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative inline-flex h-11 items-center rounded-[10px] px-3 text-body-lg transition-colors duration-150 motion-reduce:transition-none ${
                  active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {/* Reserve the 600 width so neighbours never shift when the active link changes. */}
                <span className="grid">
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold">
                    {item.topLabel}
                  </span>
                  <span className="col-start-1 row-start-1 text-center">{item.topLabel}</span>
                </span>
                {active && (
                  <m.span
                    layoutId="nav"
                    transition={spring.snappy}
                    aria-hidden
                    className="absolute inset-x-3 bottom-1.5 h-0.5 bg-ink"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Phone: a 44px round icon button. ≥768: a secondary button with the words. Hidden without a code [G7b]. */
function PeniKoduButton() {
  const { available, show } = usePeniKodu();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => show()}
      className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-ink hover:bg-surface-2 active:bg-surface-2 md:w-auto md:rounded-[10px] md:border-[1.5px] md:border-line-strong md:bg-surface md:px-4 md:text-button md:hover:bg-surface-2 md:active:bg-surface-2 ${press}`}
    >
      <QrCode size={20} strokeWidth={1.75} aria-hidden />
      <span className="sr-only md:not-sr-only">{peniCopy.peniCode}</span>
    </button>
  );
}

/** ≥768 only: the avatar menu ("Profil", "Çıkış yap"), or "Giriş yap" when signed out. */
function AccountButton({ pathname }: { pathname: string }) {
  const session = useChromeSession();
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  if (!session) {
    if (pathname.startsWith("/giris")) return null;
    return (
      <Link
        href={`/giris?returnTo=${encodeURIComponent(pathname)}`}
        className={`hidden h-11 shrink-0 items-center rounded-[10px] border-[1.5px] border-line-strong bg-surface px-5 text-button text-ink hover:bg-surface-2 md:inline-flex ${press}`}
      >
        {actionCopy.signIn}
      </Link>
    );
  }

  const signOut = () =>
    startSignOut(async () => {
      try {
        await endSession();
      } catch {
        toast.error(errorCopy.generic);
        return;
      }
      router.replace("/");
      router.refresh();
    });

  const mark = initials(session.name);
  const itemClass =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 text-body text-ink outline-none select-none data-highlighted:bg-surface-2";

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={session.name || "Profil"}
        className={`hidden size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-transparent bg-surface-2 text-button text-ink hover:border-line-strong data-popup-open:border-line-strong md:inline-flex ${press}`}
      >
        {mark ? <span aria-hidden>{mark}</span> : <UserRound size={20} strokeWidth={1.75} aria-hidden />}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50 outline-none">
          <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-[14px] bg-surface p-1.5 shadow-floating outline-none transition-[scale,opacity] duration-200 ease-out-strong data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-[.96] motion-safe:data-starting-style:scale-[.96] motion-reduce:duration-150">
            <Menu.LinkItem render={<Link href="/profil" />} closeOnClick className={itemClass}>
              <UserRound size={20} strokeWidth={1.75} aria-hidden className="text-ink-2" />
              Profil
            </Menu.LinkItem>
            <Menu.Item onClick={signOut} disabled={signingOut} className={itemClass}>
              <LogOut size={20} strokeWidth={1.75} aria-hidden className="text-ink-2" />
              {actionCopy.signOut}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
