import { InMemoryDirectory, InMemoryLedgerStore, Ledger, PeniService, defaultSettings, type CafePeniSettings, type Membership } from "../src";

export const CAFE = "cafe_kadikoy";

export function setup(overrides: Partial<CafePeniSettings> = {}) {
  let now = new Date("2026-10-15T09:00:00Z");
  const clock = () => now;
  const store = new InMemoryLedgerStore();
  const ledger = new Ledger(store);
  const directory = new InMemoryDirectory();
  directory.settings.set(CAFE, { ...defaultSettings(CAFE), askidaProductIds: ["cay", "filtre"], ...overrides });
  const service = new PeniService(ledger, directory, clock);

  const member = async (id: string, extra: Partial<Membership> = {}) => {
    const m: Membership = {
      id,
      cafeId: CAFE,
      customerId: `cust_${id}`,
      joinedAt: new Date("2026-09-01T00:00:00Z"),
      blocked: false,
      ...extra,
    };
    await directory.saveMembership(m);
    return m;
  };

  /** Gives a member peni the honest way: by paying for an order. */
  const fund = async (membershipId: string, peni: number, orderId = `seed_${membershipId}_${peni}_${Math.random()}`) => {
    const settings = await directory.getSettings(CAFE);
    const paidTotalKurus = Math.ceil((peni * 100 * 10_000) / settings.earnRateBps);
    await service.earnForPaidOrder({ membershipId, orderId, paidTotalKurus });
  };

  return {
    service,
    ledger,
    directory,
    member,
    fund,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    setNow: (d: Date) => {
      now = d;
    },
    now: () => now,
  };
}

export const HOUR = 3_600_000;
