"use client";

import type { TaskDayDTO, TaskItemDTO } from "@peni/api";
import { useCallback, useEffect, useState } from "react";
import { ListCard, SkipSheet } from "../panel/gorevler/tasks";
import { text as panelText } from "../panel/text";
import { api } from "./api";
import type { TillProps } from "./till";
import { Notice } from "./ui";

/**
 * Görevler at the till (plan piece 22): today's lists, the barista's own first. A tap marks
 * a task done; "Atla" skips it with a reason. The lists are set up in the panel.
 */
export function TillTasks({ t, slug, onError, lang, onChanged }: TillProps & { onChanged: (d: TaskDayDTO) => void }) {
  const words = panelText(lang);
  const [data, setData] = useState<TaskDayDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<TaskItemDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const got = useCallback(
    (d: TaskDayDTO) => {
      setData(d);
      setError(null);
      onChanged(d);
    },
    [onChanged],
  );
  useEffect(() => {
    api.staff.tasks.day(slug).then(got, (e: unknown) => setError(onError(e)));
  }, [slug, got, onError]);

  const check = (item: TaskItemDTO, status: "done" | "skipped" | "open", note?: string) => {
    if (!data) return;
    setBusy(true);
    api.staff.tasks
      .check(slug, { itemId: item.id, day: data.day, status, note: note ?? null })
      .then(
        (d) => {
          got(d);
          setSkipping(null);
        },
        (e: unknown) => setError(onError(e)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <h1 className="font-serif text-5xl leading-none">{t("tasks")}</h1>
        {error && !skipping && <Notice tone="red">{error}</Notice>}
        {data && data.lists.length === 0 && <p className="text-muted">{words("todayNoTasks")}</p>}
        {data?.lists.map((l) => (
          <ListCard key={l.id} list={l} t={words} lang={lang} canCheck={data.canCheck} busy={busy} onCheck={check} onSkip={setSkipping} />
        ))}
      </div>
      {skipping && (
        <SkipSheet t={words} item={skipping} busy={busy} error={error} onClose={() => setSkipping(null)} onSkip={(note) => check(skipping, "skipped", note)} />
      )}
    </div>
  );
}
