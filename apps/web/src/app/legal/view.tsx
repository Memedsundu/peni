import type { LegalDoc, LegalLang } from "./text";

/** One legal page, with the other language and the other page a tap away. */
export function LegalView({ doc, lang, path, other }: { doc: LegalDoc; lang: LegalLang; path: string; other: { href: string; label: string } }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-10 px-6 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <a href="/" className="font-serif text-2xl">
          Penny
        </a>
        <a href={lang === "tr" ? `${path}?lang=en` : path} className="text-sm font-medium" lang={lang === "tr" ? "en" : "tr"}>
          {lang === "tr" ? "EN" : "TR"}
        </a>
      </header>
      <section className="flex flex-col gap-4">
        <h1 className="font-serif text-5xl leading-tight">{doc.title}</h1>
        <p className="text-sm text-muted">{doc.updated}</p>
        <p className="text-lg leading-relaxed">{doc.intro}</p>
      </section>
      {doc.sections.map((s) => (
        <section key={s.h} className="flex flex-col gap-3">
          <h2 className="text-xl font-medium">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p} className="leading-relaxed text-ink/90">
              {p}
            </p>
          ))}
        </section>
      ))}
      <footer className="flex gap-6 border-t border-line pt-6 text-sm text-muted">
        <a href={lang === "en" ? `${other.href}?lang=en` : other.href} className="underline-offset-4 hover:underline">
          {other.label}
        </a>
        <a href="/hesap" className="underline-offset-4 hover:underline">
          {lang === "en" ? "Account" : "Hesabım"}
        </a>
      </footer>
    </main>
  );
}
