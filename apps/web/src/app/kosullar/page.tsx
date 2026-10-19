import type { Metadata } from "next";
import { LegalView } from "../legal/view";
import { controllerFromEnv, terms } from "../legal/text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kullanım koşulları" };

/** Kullanım koşulları (plan piece 34). `?lang=en` for English. */
export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "tr";
  return (
    <LegalView
      doc={terms(lang, controllerFromEnv())}
      lang={lang}
      path="/kosullar"
      other={{ href: "/gizlilik", label: lang === "en" ? "Privacy" : "Gizlilik" }}
    />
  );
}
