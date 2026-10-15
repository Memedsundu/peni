export { formatKurus, formatPeni, fulfillmentLabelsTr } from "@peni/api";

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "az önce";
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86_400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86_400)} gün önce`;
}

export function eventTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
