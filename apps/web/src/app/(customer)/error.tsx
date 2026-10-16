"use client";

import { actionCopy, errorCopy } from "@peni/brand/copy";
import { useEffect, useState } from "react";
import { Banner, Button } from "@/components/ui";

/**
 * A customer page that failed to render (design-system.md §9: errors are inline and never wipe
 * the page). The chrome stays; a danger banner names the problem and offers one retry, and a
 * quiet way home sits under it. `retry` re-fetches and re-renders the segment (Next 16).
 */
export default function CustomerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error(error);
    setRetrying(false);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4 py-2 md:py-6">
      <h1 className="sr-only">Bu sayfa açılamadı</h1>
      <Banner
        tone="danger"
        title="Bu sayfa açılamadı."
        action={
          <Button
            size="sm"
            variant="secondary"
            loading={retrying}
            loadingLabel={errorCopy.retry}
            onClick={() => {
              setRetrying(true);
              retry();
              // If it fails again with the same error, the effect above won't run: free the button.
              setTimeout(() => setRetrying(false), 2500);
            }}
          >
            {errorCopy.retry}
          </Button>
        }
      />
      <Button variant="quiet" href="/" className="-ml-3 self-start">
        {actionCopy.backToCafes}
      </Button>
    </div>
  );
}
