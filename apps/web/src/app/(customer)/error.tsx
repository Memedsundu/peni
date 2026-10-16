"use client";

import { errorCopy } from "@peni/brand/copy";
import { CircleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * Inline error for a customer page that failed to render. The chrome stays; the banner names
 * the problem and offers one retry (Banner tone="danger", §12.2: role="alert", CircleAlert).
 */
export default function CustomerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[640px] py-6">
      <div role="alert" className="flex items-start gap-3 rounded-[10px] bg-danger-soft p-3 text-ink">
        <CircleAlert size={20} strokeWidth={1.75} aria-hidden className="mt-px shrink-0 text-danger" />
        <p className="flex-1 text-body">{errorCopy.generic}</p>
        <button
          type="button"
          onClick={() => retry()}
          className="-my-2.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-[10px] px-2 text-button underline-offset-4 hover:underline"
        >
          {errorCopy.retry}
        </button>
      </div>
    </div>
  );
}
