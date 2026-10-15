import { cookies } from "next/headers";
import Link from "next/link";
import { SESSION_COOKIE } from "@/server/http";
import { getApp } from "@/server/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  const app = await getApp();
  const customer = app.customerForToken((await cookies()).get(SESSION_COOKIE)?.value ?? null);
  const cafes = await app.listCafes(customer);

  return (
    <div className="space-y-10">
      <section className="grid gap-6 pt-4 sm:grid-cols-[1.4fr_1fr] sm:items-end">
        <div>
          <h1 className="font-serif text-4xl leading-tight font-semibold sm:text-5xl">
            Bir peniye,
            <br />
            aynı masada.
          </h1>
          <p className="mt-4 max-w-prose text-lg text-ink-2">
            17. yüzyıl İngiltere&apos;sinde kahvehanelere bir peni verip girilir, soylusu da tüccarı da aynı masada
            tartışırdı. Bu yüzden onlara &ldquo;peni üniversitesi&rdquo; denirdi. Peni her kafeyi mahallesinin küçük
            kamusal alanına çevirir. Siparişini önceden ver, harcadıkça peni biriktir, bir komşuna ısmarla ya da askıya
            kahve bırak.
          </p>
        </div>
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold tracking-wide text-copper uppercase">Askıda kahve</p>
          <p>
            Penilerini kafenin <strong>askısına</strong> bırak. Kim ihtiyaç duyarsa, adı hiç görünmeden oradan bir çay
            ya da kahve alır. Kasada nakit bırakılan askılar da aynı askıya düşer.
          </p>
          {!customer && (
            <Link href="/giris" className="btn btn-primary">
              Telefonla giriş yap
            </Link>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-serif text-2xl font-semibold">Kafeler</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {cafes.map((c) => (
            <Link key={c.id} href={`/k/${c.slug}`} className="card block p-5 transition hover:border-copper">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl font-semibold">{c.name}</h3>
                  <p className="text-sm text-ink-2">
                    {[c.district, c.city].filter(Boolean).join(", ")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    c.acceptingOrders ? "bg-leaf-soft text-leaf" : "bg-surface-2 text-ink-2"
                  }`}
                >
                  {c.acceptingOrders ? "Sipariş alıyor" : "Şu an kapalı"}
                </span>
              </div>
              <p className="mt-4 text-sm">
                <span className="coin" aria-hidden />{" "}
                {c.askidaItemsAvailable > 0
                  ? `Askıda ${c.askidaItemsAvailable} ikram bekliyor`
                  : "Askı şu an boş"}
                {c.isMember && <span className="ml-2 text-ink-2">· Üyesin</span>}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
