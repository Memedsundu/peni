"use client";

import { createPeniClient, PeniApiError } from "@peni/api";
import { errorCopy, staffCopy } from "@peni/brand/copy";
import { useState, type FormEvent } from "react";
import { usePress } from "@/components/chrome/press-header";
import { DeviceGlyph } from "@/components/brand";
import { Button, Card, Field, Input } from "@/components/ui";

/**
 * Gate (design-system.md §9.10): no staff key stored. A centred card, h2 "Kafe paneli", the
 * "Personel anahtarı" password field and "Gir". The key is checked against the dashboard
 * before it is stored; a wrong one reads "Anahtar tutmadı." and keeps what was typed.
 */
export function StaffGate({ notice }: { notice?: string | null }) {
  const { slug, cafeName, signIn } = usePress();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLElement>) => {
    event.preventDefault();
    const candidate = key.trim();
    if (!candidate) {
      setError(errorCopy.staffKey);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Try the key without storing it: only a key that opens this café's board is kept.
      const probe = createPeniClient({ baseUrl: "", getStaffKey: () => candidate });
      await probe.staff.dashboard(slug);
      signIn(candidate);
    } catch (e) {
      setError(e instanceof PeniApiError && (e.status === 401 || e.status === 403) ? errorCopy.staffKey : e instanceof Error ? e.message : errorCopy.generic);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-h)-4rem)] items-center justify-center py-10">
      <Card as="form" onSubmit={submit} padding="none" className="w-full max-w-[400px] p-6 md:p-8" aria-labelledby="staff-gate-title">
        <div className="flex items-center gap-2 text-ink-2">
          <DeviceGlyph slug={slug} size={20} />
          <p className="min-w-0 truncate legend">{cafeName}</p>
        </div>
        <h2 id="staff-gate-title" className="mt-3 font-display text-h2 text-ink">
          {staffCopy.gate.title}
        </h2>
        <Field label={staffCopy.gate.keyLabel} error={error} className="mt-6">
          <Input
            type="password"
            name="staff-key"
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <Button type="submit" size="lg" fullWidth loading={busy} className="mt-6">
          {staffCopy.gate.submit}
        </Button>
      </Card>
    </div>
  );
}
