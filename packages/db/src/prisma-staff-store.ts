import {
  isPermission,
  normalizeEmail,
  type RoleOverride,
  type StaffAccount,
  type StaffMember,
  type StaffStore,
  type TillDevice,
} from "@peni/core";
import type { Db } from "./db";
import type { Prisma } from "./generated/client";

const ACCOUNT = { id: true, email: true, name: true, passwordHash: true, customerId: true, disabledAt: true } as const;
const MEMBER = {
  id: true,
  cafeId: true,
  accountId: true,
  role: true,
  createdAt: true,
  removedAt: true,
  pinHash: true,
  pinFailures: true,
  pinLockedUntil: true,
} as const;
const DEVICE = { id: true, cafeId: true, name: true, createdAt: true, createdByMemberId: true, lastSeenAt: true, revokedAt: true } as const;

export class PrismaStaffStore implements StaffStore {
  constructor(private readonly db: Db) {}

  async getAccount(id: string): Promise<StaffAccount | null> {
    return this.db().staffAccount.findUnique({ where: { id }, select: ACCOUNT });
  }

  async getAccountByEmail(email: string): Promise<StaffAccount | null> {
    return this.db().staffAccount.findUnique({ where: { email: normalizeEmail(email) }, select: ACCOUNT });
  }

  async accountForCustomer(customerId: string): Promise<StaffAccount | null> {
    return this.db().staffAccount.findUnique({ where: { customerId }, select: ACCOUNT });
  }

  async saveAccount(account: StaffAccount): Promise<void> {
    const data = { ...account, email: normalizeEmail(account.email) };
    const { id, ...update } = data;
    await this.db().staffAccount.upsert({ where: { id }, create: data, update });
  }

  async getMember(id: string): Promise<StaffMember | null> {
    return this.db().staffMember.findUnique({ where: { id }, select: MEMBER });
  }

  async memberAt(accountId: string, cafeId: string): Promise<StaffMember | null> {
    return this.db().staffMember.findUnique({ where: { cafeId_accountId: { cafeId, accountId } }, select: MEMBER });
  }

  async listMembers(cafeId: string): Promise<StaffMember[]> {
    return this.db().staffMember.findMany({
      where: { cafeId, removedAt: null },
      select: MEMBER,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async membershipsOf(accountId: string): Promise<StaffMember[]> {
    return this.db().staffMember.findMany({
      where: { accountId, removedAt: null },
      select: MEMBER,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async saveMember(member: StaffMember): Promise<void> {
    const { id, ...update } = member;
    await this.db().staffMember.upsert({ where: { id }, create: member, update });
  }

  async createSession(
    accountId: string,
    tokenHash: string,
    expiresAt: Date,
    pin?: { cafeId: string; deviceId: string },
  ): Promise<void> {
    await this.db().staffSession.create({
      data: { accountId, tokenHash, expiresAt, ...(pin ? { method: "pin" as const, ...pin } : {}) },
    });
  }

  async sessionFor(tokenHash: string) {
    return this.db().staffSession.findUnique({
      where: { tokenHash },
      select: { accountId: true, expiresAt: true, revokedAt: true, method: true, cafeId: true, deviceId: true },
    });
  }

  async revokeSession(tokenHash: string, at: Date): Promise<void> {
    await this.db().staffSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeSessionsOf(accountId: string, at: Date, exceptTokenHash?: string): Promise<void> {
    await this.db().staffSession.updateMany({
      where: { accountId, revokedAt: null, ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}) },
      data: { revokedAt: at },
    });
  }

  async revokeSessionsOnDevice(deviceId: string, at: Date): Promise<void> {
    await this.db().staffSession.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: at } });
  }

  async createDevice(device: TillDevice, tokenHash: string): Promise<void> {
    await this.db().tillDevice.create({ data: { ...device, tokenHash } });
  }

  async getDevice(id: string): Promise<TillDevice | null> {
    return this.db().tillDevice.findUnique({ where: { id }, select: DEVICE });
  }

  async deviceForToken(tokenHash: string): Promise<TillDevice | null> {
    return this.db().tillDevice.findUnique({ where: { tokenHash }, select: DEVICE });
  }

  async listDevices(cafeId: string): Promise<TillDevice[]> {
    return this.db().tillDevice.findMany({
      where: { cafeId, revokedAt: null },
      select: DEVICE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async saveDevice(device: TillDevice): Promise<void> {
    const { id, ...data } = device;
    await this.db().tillDevice.update({ where: { id }, data });
  }

  async recordFailedSignIn(email: string, at: Date): Promise<void> {
    await this.db().staffSignInFailure.create({ data: { email: normalizeEmail(email), at } });
  }

  async countFailedSignIns(email: string, since: Date): Promise<number> {
    return this.db().staffSignInFailure.count({ where: { email: normalizeEmail(email), at: { gt: since } } });
  }

  async listOverrides(cafeId: string): Promise<RoleOverride[]> {
    const rows = await this.db().rolePermission.findMany({ where: { cafeId }, orderBy: { permission: "asc" } });
    return rows.flatMap((r) =>
      r.role !== "owner" && isPermission(r.permission) ? [{ role: r.role, permission: r.permission, allowed: r.allowed }] : [],
    );
  }

  /** Delete and insert together, so a café never has half its role changes. */
  async replaceOverrides(cafeId: string, overrides: readonly RoleOverride[]): Promise<void> {
    const db = this.db();
    const write = async (tx: Prisma.TransactionClient) => {
      await tx.rolePermission.deleteMany({ where: { cafeId } });
      if (overrides.length > 0) await tx.rolePermission.createMany({ data: overrides.map((o) => ({ cafeId, ...o })) });
    };
    if ("$transaction" in db) await db.$transaction(write);
    else await write(db);
  }
}
