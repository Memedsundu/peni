import { redirect } from "next/navigation";

/** The panel opens on Bugün (plan piece 22). */
export default async function PanelHome({ searchParams }: { searchParams: Promise<{ kafe?: string }> }) {
  const q = await searchParams;
  redirect(q.kafe ? `/panel/bugun?kafe=${encodeURIComponent(q.kafe)}` : "/panel/bugun");
}
