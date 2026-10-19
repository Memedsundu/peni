import type { Metadata } from "next";
import { CustomerScreen } from "../screen";

export const metadata: Metadata = { title: "Müşteri ekranı" };

/** The small screen facing the customer (plan piece 7), a second window on the till's computer. */
export default function CustomerScreenPage() {
  return <CustomerScreen />;
}
