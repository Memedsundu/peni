"use client";

import { PeniApiError, type PeniCheckDTO, type PennyCounterCodeDTO, type PennyCounterDTO } from "@peni/api";
import { formatTL } from "@peni/brand/format";
import { useEffect, useState } from "react";
import { api } from "../../kasa/api";
import { Qr } from "../../kasa/qr";
import { Button, Notice } from "../../kasa/ui";
import { parseNumber, parseTL } from "../amounts";
import { Field, useSave } from "../controls";
import { PanelShell, type PanelProps } from "../shell";
import { errorText, fill } from "../text";

const newKey = () => crypto.randomUUID();

/**
 * The penny screen (N11): for a café that takes the money on its own till. Give a penny code
 * for what was paid and turn the screen round, take pennies off a bill, and the askı.
 */
export function Counter({ cafeSlug }: { cafeSlug: string | null }) {
  return (
    <PanelShell cafeSlug={cafeSlug} page="penny">
      {(p) => <CounterPage key={p.cafe.slug} {...p} />}
    </PanelShell>
  );
}

function CounterPage(p: PanelProps) {
  const { cafe, t, lang, signedOut } = p;
  const [data, setData] = useState<PennyCounterDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.staff.penny.get(cafe.slug).then(setData, (e: unknown) => {
      if (e instanceof PeniApiError && e.status === 401) signedOut();
      else setError(errorText(e, lang));
    });
  }, [cafe.slug]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <p className="text-sm text-muted">{cafe.name}</p>
        <h1 className="font-serif text-5xl leading-none">{t("navPenny")}</h1>
        <p className="max-w-2xl leading-normal text-muted">{t("pcHelp")}</p>
      </section>
      {error && <Notice tone="red">{error}</Notice>}
      {data && !data.on && <Notice>{t("pcOff")}</Notice>}
      {data?.on && (
        <>
          <Give {...p} data={data} setData={setData} />
          <Spend {...p} data={data} />
          <Askida {...p} data={data} setData={setData} />
          <Codes {...p} data={data} setData={setData} />
        </>
      )}
    </>
  );
}

type Part = PanelProps & { data: PennyCounterDTO; setData?: (d: PennyCounterDTO) => void };

/** Type what was paid, then the code to turn toward the customer. */
function Give({ cafe, t, lang, data, setData }: Part) {
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(newKey);
  const [shown, setShown] = useState<PennyCounterCodeDTO | null>(null);
  const save = useSave(lang, (r: Awaited<ReturnType<typeof api.staff.penny.give>>) => {
    setData!(r);
    setShown(r.given);
  });
  const kurus = parseTL(amount);
  const peni = kurus ? Math.floor((kurus * data.earnRatePercent) / 100 / 100) : 0;

  if (shown) {
    return (
      <section aria-label={t("pcGive")} className="flex flex-col items-center gap-5 rounded-3xl border border-ink p-6 text-center sm:flex-row sm:text-left">
        <Qr value={`${window.location.origin}/p/${shown.token}`} size={220} label={t("pcScan")} />
        <div className="flex flex-col gap-3">
          <p className="text-lg leading-normal">{t("pcScan")}</p>
          <p aria-label={shown.code.split("").join(" ")} className="tabular text-6xl font-semibold tracking-[0.2em]">
            {shown.code}
          </p>
          <p className="font-semibold text-green">{fill(t("pcFor"), { tl: formatTL(shown.paidKurus), peni: shown.peni })}</p>
          <Button
            kind="primary"
            className="self-center sm:self-start"
            onClick={() => {
              setShown(null);
              setAmount("");
              setKey(newKey());
            }}
          >
            {t("pcDone")}
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("pcGive")}</h2>
        <p className="text-sm leading-normal text-muted">{t("pcGiveHelp")}</p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (kurus) save.run(() => api.staff.penny.give(cafe.slug, { amountKurus: kurus, key }));
        }}
      >
        <div className="flex-1">
          <Field
            label={t("pcPaid")}
            value={amount}
            onChange={setAmount}
            suffix="₺"
            inputMode="decimal"
            hint={peni > 0 ? fill(t("pcEarns"), { peni, rate: data.earnRatePercent }) : undefined}
          />
        </div>
        <Button kind="primary" type="submit" disabled={!kurus || save.busy}>
          {t("pcShow")}
        </Button>
      </form>
      {save.error && <Notice tone="red">{save.error}</Notice>}
    </section>
  );
}

/** The customer's ödeme kodu and the bill; check whose it is, then take the pennies. */
function Spend({ cafe, t, lang }: Part) {
  const [code, setCode] = useState("");
  const [bill, setBill] = useState("");
  const [check, setCheck] = useState<PeniCheckDTO | null>(null);
  const [howMany, setHowMany] = useState("");
  const [key, setKey] = useState(newKey);
  const [done, setDone] = useState<string | null>(null);
  const checking = useSave(lang, (r: PeniCheckDTO) => {
    setCheck(r);
    setHowMany(String(r.maxPeni));
  });
  const taking = useSave(lang, (r: Awaited<ReturnType<typeof api.staff.penny.spend>>) => {
    setDone(fill(t("pcTaken"), { peni: r.peni, tl: formatTL(r.peni * 100) }));
    setCheck(null);
    setCode("");
    setBill("");
    setKey(newKey());
  });
  const kurus = parseTL(bill);
  const peni = parseNumber(howMany);
  const reset = () => {
    setCheck(null);
    setDone(null);
  };

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("pcSpend")}</h2>
        <p className="text-sm leading-normal text-muted">{t("pcSpendHelp")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("pcSpendCode")} value={code} onChange={(v) => {
            setCode(v);
            reset();
          }} inputMode="decimal" maxLength={7} placeholder="123 456" />
        <Field label={t("pcBill")} value={bill} onChange={(v) => {
            setBill(v);
            reset();
          }} suffix="₺" inputMode="decimal" />
      </div>
      {!check ? (
        <Button
          kind="quiet"
          className="self-start"
          disabled={!kurus || code.replace(/\s/g, "").length !== 6 || checking.busy}
          onClick={() => kurus && checking.run(() => api.staff.penny.check(cafe.slug, { code, amountKurus: kurus }))}
        >
          {t("pcCheck")}
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="font-semibold">{fill(t("pcHas"), { name: check.name, balance: check.balancePeni, max: check.maxPeni })}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label={t("pcHowMany")} value={howMany} onChange={setHowMany} suffix="penny" inputMode="decimal" />
            </div>
            <Button
              kind="primary"
              disabled={!peni || peni > check.maxPeni || taking.busy}
              onClick={() => kurus && peni && taking.run(() => api.staff.penny.spend(cafe.slug, { code, amountKurus: kurus, peni, key }))}
            >
              {t("pcTake")}
            </Button>
          </div>
        </div>
      )}
      {done && <p className="font-semibold text-green">{done}</p>}
      {(checking.error || taking.error) && <Notice tone="red">{checking.error ?? taking.error}</Notice>}
    </section>
  );
}

/** What's on the askı, giving one item from it, and cash someone left for it. */
function Askida({ cafe, t, lang, data, setData }: Part) {
  const [done, setDone] = useState<string | null>(null);
  const [cash, setCash] = useState("");
  const [cashKey, setCashKey] = useState(newKey);
  const giving = useSave(lang, setData!);
  const adding = useSave(lang, () => {
    setDone(fill(t("pcAskidaAdded"), { tl: formatTL((parseNumber(cash) ?? 0) * 100) }));
    setCash("");
    setCashKey(newKey());
    void api.staff.penny.get(cafe.slug).then(setData!);
  });
  const lira = parseNumber(cash);
  if (!data.askida.enabled) return null;
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-panel p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{t("pcAskida")}</h2>
        <p className="text-sm text-muted">{fill(t("pcAskidaHas"), { peni: data.askida.balancePeni })}</p>
      </div>
      {data.askida.items.length > 0 && (
        <ul className="flex flex-col">
          {data.askida.items.map((i) => (
            <li key={i.productId} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-b-0">
              <span className="flex flex-col">
                <span className="text-lg">{i.name}</span>
                <span className="text-sm text-muted">{fill(t("pcAskidaLeft"), { n: i.available })}</span>
              </span>
              <Button
                kind="quiet"
                size="sm"
                disabled={i.available < 1 || giving.busy}
                onClick={() => {
                  setDone(fill(t("pcAskidaGiven"), { name: i.name }));
                  giving.run(() => api.staff.penny.askida(cafe.slug, { productId: i.productId, key: newKey() }));
                }}
              >
                {t("pcAskidaGive")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (lira && Number.isInteger(lira)) adding.run(() => api.staff.tillDonation(cafe.slug, { peni: lira, idempotencyKey: cashKey }));
        }}
      >
        <div className="flex-1">
          <Field label={t("pcAskidaCash")} value={cash} onChange={setCash} suffix="₺" inputMode="decimal" />
        </div>
        <Button kind="quiet" type="submit" disabled={!lira || !Number.isInteger(lira) || adding.busy}>
          {t("pcAskidaCashAdd")}
        </Button>
      </form>
      {done && !giving.error && !adding.error && <p className="font-semibold text-green">{done}</p>}
      {(giving.error || adding.error) && <Notice tone="red">{giving.error ?? adding.error}</Notice>}
    </section>
  );
}

/** Today's codes from this screen: who gave what, and whether the customer took it. */
function Codes({ cafe, t, lang, data, setData }: Part) {
  const cancel = useSave(lang, setData!);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="codes">
      <h2 id="codes" className="text-sm text-muted">
        {t("pcToday")}
      </h2>
      {data.codes.length === 0 ? (
        <p className="text-muted">{t("pcNone")}</p>
      ) : (
        <ul className="flex flex-col">
          {data.codes.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-3 last:border-b-0">
              <span className="flex flex-col">
                <span className="tabular">
                  {new Date(c.createdAt).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {fill(t("pcFor"), { tl: formatTL(c.paidKurus), peni: c.peni })}
                </span>
                <span className="text-sm text-muted">
                  {c.givenBy} · {c.code} · {t(`pcState_${c.state}`)}
                </span>
              </span>
              {c.state === "open" && (
                <Button kind="bare" size="sm" disabled={cancel.busy} onClick={() => cancel.run(() => api.staff.penny.cancel(cafe.slug, c.id))}>
                  {t("pcCancel")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cancel.error && <Notice tone="red">{cancel.error}</Notice>}
    </section>
  );
}
