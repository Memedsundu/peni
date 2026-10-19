import type { Cafe, Customer, CustomerLogin, EmailCode, IdentityStore, LoginProvider } from "@peni/core";
import type { Db } from "./db";
import { Prisma } from "./generated/client";

const CAFE = {
  id: true,
  slug: true,
  name: true,
  address: true,
  district: true,
  city: true,
  coverImageUrl: true,
  referenceProductIds: true,
  hue: true,
} as const;
const CUSTOMER = { id: true, phone: true, email: true, displayName: true, avatarUrl: true, profileVisible: true } as const;
const LOGIN = { customerId: true, provider: true, subject: true, email: true } as const;

export class PrismaIdentityStore implements IdentityStore {
  constructor(private readonly db: Db) {}

  async listCafes(): Promise<Cafe[]> {
    return this.db().cafe.findMany({ select: CAFE, orderBy: [{ createdAt: "asc" }, { name: "asc" }] });
  }

  async getCafe(id: string): Promise<Cafe | null> {
    return this.db().cafe.findUnique({ where: { id }, select: CAFE });
  }

  async getCafeBySlug(slug: string): Promise<Cafe | null> {
    return this.db().cafe.findUnique({ where: { slug }, select: CAFE });
  }

  async saveCafe(cafe: Cafe): Promise<void> {
    const { id, ...data } = cafe;
    await this.db().cafe.upsert({ where: { id }, create: cafe, update: data });
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.db().customer.findUnique({ where: { id }, select: CUSTOMER });
  }

  async getCustomers(ids: readonly string[]): Promise<Customer[]> {
    if (ids.length === 0) return [];
    return this.db().customer.findMany({ where: { id: { in: [...ids] } }, select: CUSTOMER });
  }

  async getCustomerByPhone(phone: string): Promise<Customer | null> {
    return this.db().customer.findUnique({ where: { phone }, select: CUSTOMER });
  }

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    return this.db().customer.findUnique({ where: { email: email.trim().toLowerCase() }, select: CUSTOMER });
  }

  async findLogin(provider: LoginProvider, subject: string): Promise<CustomerLogin | null> {
    return this.db().customerLogin.findUnique({ where: { provider_subject: { provider, subject } }, select: LOGIN });
  }

  async addLogin(login: CustomerLogin): Promise<void> {
    await this.db().customerLogin.upsert({
      where: { provider_subject: { provider: login.provider, subject: login.subject } },
      create: login,
      update: {},
    });
  }

  async loginsOf(customerId: string): Promise<CustomerLogin[]> {
    return this.db().customerLogin.findMany({ where: { customerId }, select: LOGIN, orderBy: { createdAt: "asc" } });
  }

  async saveEmailCode(code: EmailCode): Promise<void> {
    const { id, ...update } = code;
    await this.db().emailCode.upsert({ where: { id }, create: code, update });
  }

  async liveEmailCode(email: string, now: Date): Promise<EmailCode | null> {
    return this.db().emailCode.findFirst({
      where: { email, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
  }

  async countEmailCodes(email: string, since: Date): Promise<number> {
    return this.db().emailCode.count({ where: { email, createdAt: { gt: since } } });
  }

  async saveCustomer(customer: Customer): Promise<void> {
    const { id, ...data } = customer;
    await this.db().customer.upsert({ where: { id }, create: customer, update: data });
  }

  async createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db().customerSession.create({ data: { customerId, tokenHash, expiresAt } });
  }

  async customerIdForSession(tokenHash: string, now: Date): Promise<string | null> {
    const s = await this.db().customerSession.findUnique({ where: { tokenHash } });
    return s && !s.revokedAt && s.expiresAt > now ? s.customerId : null;
  }

  async revokeSession(tokenHash: string, at: Date): Promise<void> {
    await this.db().customerSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: at } });
  }

  async forgetCustomer(customerId: string, displayName: string, at: Date): Promise<void> {
    const db = this.db();
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { email: true } });
    if (!c) return;
    const logins = await db.customerLogin.findMany({ where: { customerId }, select: { email: true } });
    const emails = [...new Set([c.email, ...logins.map((l) => l.email)].filter((e): e is string => !!e))];
    await db.customer.update({
      where: { id: customerId },
      data: { displayName, email: null, phone: null, avatarUrl: null, bio: null, profileVisible: false, deletionRequestedAt: at },
    });
    await db.customerLogin.deleteMany({ where: { customerId } });
    await db.customerSession.updateMany({ where: { customerId, revokedAt: null }, data: { revokedAt: at } });
    await db.customerDevice.deleteMany({ where: { customerId } });
    if (emails.length) await db.emailCode.deleteMany({ where: { email: { in: emails } } });
  }

  async memberCodeOf(membershipId: string): Promise<string | null> {
    const m = await this.db().membership.findUnique({ where: { id: membershipId }, select: { memberCode: true } });
    return m?.memberCode ?? null;
  }

  async setMemberCode(membershipId: string, code: string): Promise<boolean> {
    try {
      await this.db().membership.update({ where: { id: membershipId }, data: { memberCode: code } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  async membershipIdForCode(code: string): Promise<string | null> {
    const m = await this.db().membership.findUnique({ where: { memberCode: code }, select: { id: true } });
    return m?.id ?? null;
  }

  async recordLookup(customerId: string, at: Date): Promise<void> {
    await this.db().giftLookup.create({ data: { customerId, at } });
  }

  async countLookups(customerId: string, since: Date): Promise<number> {
    return this.db().giftLookup.count({ where: { customerId, at: { gt: since } } });
  }
}
