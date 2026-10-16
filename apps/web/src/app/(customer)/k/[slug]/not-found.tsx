import { CafeNotFound } from "@/components/cafe/cafe-states";

/** `/k/<unknown>`: "Bu kafe masada yok." + "Kafelere dön", served with a 404. */
export default function NotFound() {
  return <CafeNotFound />;
}
