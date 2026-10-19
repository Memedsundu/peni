import type { Metadata } from "next";
import { LegalView } from "../legal/view";
import { controllerFromEnv, privacy } from "../legal/text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gizlilik" };

/** KVKK aydınlatma metni and privacy notice (plan piece 34). `?lang=en` for English. */
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "tr";
  return (
    <LegalView
      doc={privacy(lang, controllerFromEnv())}
      lang={lang}
      path="/gizlilik"
      other={{ href: "/kosullar", label: lang === "en" ? "Terms of use" : "Kullanım koşulları" }}
    />
  );
}
