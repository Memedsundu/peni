"use client";

import type { OrderDTO } from "@peni/api";
import { LazyMotion, MotionConfig } from "motion/react";
import { ActiveOrderProvider } from "@/components/chrome/active-order";
import { ChromeLayerProvider } from "@/components/chrome/layer";
import { PeniKoduProvider } from "@/components/chrome/peni-kodu";
import { ChromeSessionProvider, type ChromeSession } from "@/components/chrome/session";
import { Toaster } from "@/components/ui/toast";

/** Motion features load on demand (§7.1); `strict` makes a stray `motion.*` throw — use `m.*`. */
const loadFeatures = () => import("@/lib/motion-features").then((r) => r.default);

/**
 * Root providers, in order (design-system.md §8.1): LazyMotion → MotionConfig → sonner Toaster.
 * The Toaster is the one from `@/components/ui/toast` (§12.2: top-centre, one visible, unstyled
 * with İlan classes, 4s; `toastUndo` uses 5s). Toasts are only for async outcomes the screen
 * doesn't already show; there is NEVER a toast after sending an order.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster />
      </MotionConfig>
    </LazyMotion>
  );
}

/**
 * Customer-group providers, mounted by (customer)/layout.tsx: who is signed in, the active
 * order (header chip + nav dot), the floating-layer budget, and the Peni kodum dialog state.
 */
export function CustomerProviders({
  session,
  initialOrders,
  children,
}: {
  session: ChromeSession | null;
  initialOrders: readonly OrderDTO[];
  children: React.ReactNode;
}) {
  return (
    <ChromeSessionProvider session={session}>
      <ActiveOrderProvider signedIn={session !== null} initialOrders={initialOrders}>
        <ChromeLayerProvider>
          <PeniKoduProvider>{children}</PeniKoduProvider>
        </ChromeLayerProvider>
      </ActiveOrderProvider>
    </ChromeSessionProvider>
  );
}
