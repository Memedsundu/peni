import type { Metadata } from "next";
import { Account } from "./account";

export const metadata: Metadata = { title: "Hesabım", robots: { index: false } };

/** Hesabım (plan piece 34): download your data, delete your account. Also the deletion link for the app stores. */
export default function AccountPage() {
  return <Account />;
}
