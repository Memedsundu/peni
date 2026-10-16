/**
 * The board's load error (§9.10 "Errors: Banner tone="danger" with "Tekrar dene"; the board
 * keeps the last data"), at the top of a staff tab. It says which way it failed: nothing on
 * screen yet ("Tezgâh yüklenemedi.") or the last good board still showing ("Tezgâh
 * güncellenemedi." + "Son gelen hâli görüyorsun."). Never below the fold (§10).
 */
import { errorCopy } from "@peni/brand/copy";
import { useState } from "react";
import { Banner, Button } from "@/components/ui";

const STALE_NOTE = "Son gelen hâli görüyorsun.";

export function BoardErrorBanner({ what, stale, onRetry }: { what: string; stale: boolean; onRetry: () => Promise<unknown> }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <Banner
      tone="danger"
      title={stale ? `${what} güncellenemedi.` : `${what} yüklenemedi.`}
      action={
        <Button
          title={errorCopy.retry}
          variant="secondary"
          size="sm"
          loading={retrying}
          loadingLabel={errorCopy.retry}
          onPress={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              setRetrying(false);
            }
          }}
        />
      }
    >
      {stale ? STALE_NOTE : undefined}
    </Banner>
  );
}
