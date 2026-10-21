import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  FROM_SHELBY,
  InMemoryStaffStore,
  NO_PIN,
  TILL_PERMISSIONS,
  pinProblem,
  PERMISSIONS,
  STAFF_ROLES,
  overridesFrom,
  overridesFromShelby,
  permissionsFor,
  roleMatrix,
} from "../src";

/** Shelby's default roles per permission key (src/lib/permission-registry.ts), admin left out. */
const SHELBY_DEFAULTS: Record<string, string[]> = {
  "page:/admin/cash": ["manager", "chef", "barista"],
  "api:cash:read": ["manager", "chef", "barista"],
  "api:cash:count": ["manager", "chef", "barista"],
  "api:money:manage": ["manager"],
  "page:/": ["manager", "chef", "barista"],
  "page:/orders": ["manager", "chef", "barista"],
  "page:/admin/dashboard": ["manager", "chef"],
  "page:/admin/alerts": ["manager", "chef"],
  "page:/admin/products": ["manager"],
  "page:/admin/inventory": ["manager", "chef"],
  "page:/admin/expenses": ["manager", "chef", "barista"],
  "page:/admin/suppliers": ["manager", "chef"],
  "page:/admin/shifts": ["manager", "chef", "barista"],
  "page:/admin/tasks": ["manager", "chef", "barista"],
  "page:/admin/payroll": ["manager", "chef"],
  "page:/admin/reports": ["manager"],
  "page:/admin/assistant": ["manager"],
  "page:/admin/checks": ["manager", "chef"],
  "page:/admin/credit-card": ["manager"],
  "page:/admin/settings": [],
  "page:/admin/team": [],
  "api:products:write": ["manager"],
  "api:categories:write": ["manager"],
  "api:inventory:read": ["manager", "chef"],
  "api:inventory:write": ["manager", "chef"],
  "api:inventory:movements:read": ["manager", "chef"],
  "api:inventory:deliveries:read": ["manager", "chef"],
  "api:inventory:deliveries:write": ["manager", "chef"],
  "api:stock-categories:write": ["manager", "chef"],
  "api:stock:write": ["manager", "chef"],
  "api:recipes:write": ["manager", "chef"],
  "api:expenses:read": ["manager", "chef", "barista"],
  "api:expenses:write": ["manager", "chef", "barista"],
  "api:expenses:manage": ["manager"],
  "api:suppliers:read": ["manager", "chef"],
  "api:suppliers:write": ["manager", "chef"],
  "api:checks:read": ["manager", "chef"],
  "api:checks:write": ["manager", "chef"],
  "api:debts:read": ["manager", "chef"],
  "api:debts:write": ["manager", "chef"],
  "api:credit-card:read": ["manager"],
  "api:credit-card:write": ["manager"],
  "api:dashboard:read": ["manager", "chef"],
  "api:alerts:read": ["manager", "chef"],
  "api:alerts:run": [],
  "api:reports:read": ["manager"],
  "api:reports:analytics:read": ["manager"],
  "api:ai:use": ["manager"],
  "api:shifts:read": ["manager", "chef", "barista"],
  "api:shifts:write": ["manager", "chef"],
  "api:timesheets:read": ["manager", "chef"],
  "api:timesheets:write": ["manager", "chef"],
  "api:timesheets:export": ["manager", "chef"],
  "api:timesheets:payout:write": ["manager", "chef"],
  "api:tasks:read": ["manager", "chef", "barista"],
  "api:tasks:complete": ["manager", "chef", "barista"],
  "api:tasks:templates:write": ["manager", "chef"],
  "api:payroll:read": ["manager", "chef"],
  "api:payroll:close": ["manager"],
  "api:payroll:reopen": ["manager"],
  "api:orders:correct": ["manager"],
  "api:orders:delete": [],
  "api:team:staff:read": ["manager", "chef"],
  "api:team:all": [],
  "api:pos-config:write": [],
  "api:cafe-settings:write": [],
  "api:email:status": [],
  "api:email:test": [],
  "api:permissions:write": [],
};

/** Shelby keys with no place in Peni: email checks and the alerts cron are not staff actions. */
const NOT_CARRIED = ["api:alerts:run", "api:email:status", "api:email:test"];

describe("roles", () => {
  it("gives the owner every permission, whatever the café changes", () => {
    const owner = permissionsFor("owner", [{ role: "owner" as never, permission: "till.use", allowed: false }], "isletme");
    expect(owner.size).toBe(ALL_PERMISSIONS.length);
  });

  it("starts each role with Shelby's access", () => {
    const barista = permissionsFor("barista", [], "isletme");
    expect(barista.has("till.use")).toBe(true);
    expect(barista.has("bills.add")).toBe(true);
    expect(barista.has("stock.view")).toBe(false);
    expect(barista.has("till.correct")).toBe(false);
    const chef = permissionsFor("chef", [], "isletme");
    expect(chef.has("stock.edit")).toBe(true);
    expect(chef.has("pay.payouts")).toBe(true);
    expect(chef.has("menu.edit")).toBe(false);
    expect(chef.has("reports.view")).toBe(false);
    const manager = permissionsFor("manager", [], "isletme");
    expect(manager.has("reports.view")).toBe(true);
    expect(manager.has("team.manage")).toBe(false);
  });

  it("applies a café's changes but never to locked permissions", () => {
    const matrix = roleMatrix([
      { role: "barista", permission: "stock.view", allowed: true },
      { role: "barista", permission: "till.use", allowed: false },
      { role: "manager", permission: "team.manage", allowed: true },
      { role: "barista", permission: "reports.view", allowed: true },
    ]);
    expect(matrix.barista["stock.view"]).toBe(true);
    expect(matrix.barista["till.use"]).toBe(false);
    expect(matrix.manager["team.manage"]).toBe(false);
    expect(matrix.barista["reports.view"]).toBe(false);
  });

  it("stores only what differs from the defaults", () => {
    const saved = overridesFrom({
      owner: { "till.use": false },
      manager: { "reports.view": false, "menu.edit": true, "posts.write": false },
      barista: { "stock.view": true, "till.use": true, "nonsense.key": true },
    });
    expect(saved).toEqual([
      { role: "manager", permission: "posts.write", allowed: false },
      { role: "barista", permission: "stock.view", allowed: true },
    ]);
  });

  it("labels every permission in Turkish and English and files it under a section", () => {
    for (const p of ALL_PERMISSIONS) {
      const d = PERMISSIONS[p];
      expect(d.label.tr && d.label.en && d.hint.tr && d.hint.en).toBeTruthy();
      expect(d.roles.every((r) => STAFF_ROLES.includes(r))).toBe(true);
    }
  });
});

describe("the till PIN", () => {
  it("takes 4 to 6 digits that aren't a run or a repeat", () => {
    for (const ok of ["2580", "190319", "7741", "13579"]) expect(pinProblem(ok)).toBeNull();
    for (const easy of ["1111", "1234", "4321", "987654", "000000"]) expect(pinProblem(easy)).toBe("PIN_TOO_EASY");
    for (const bad of ["123", "1234567", "12a4", " 2580"]) expect(pinProblem(bad)).toBe("PIN_FORMAT");
  });

  it("opens only the till's own work", () => {
    expect(TILL_PERMISSIONS).toEqual(["till.use", "till.history", "till.correct", "bills.add", "cash.drawer", "shifts.view", "tasks.view", "peni.till"]);
    for (const p of ["team.manage", "roles.manage", "reports.view", "cash.manage", "devices.manage", "assistant.use"]) {
      expect(TILL_PERMISSIONS).not.toContain(p);
    }
  });
});

describe("moving Shelby's roles across", () => {
  it("has a place for every Shelby permission", () => {
    const missing = Object.keys(SHELBY_DEFAULTS).filter((k) => !FROM_SHELBY[k] && !NOT_CARRIED.includes(k));
    expect(missing).toEqual([]);
    for (const targets of Object.values(FROM_SHELBY)) for (const p of targets) expect(ALL_PERMISSIONS).toContain(p);
  });

  it("turns Shelby's defaults into Peni's defaults, so nobody's access changes", () => {
    const rows = Object.entries(SHELBY_DEFAULTS).flatMap(([resource, roles]) =>
      ["manager", "chef", "barista"].map((role) => ({ role, resource, allowed: roles.includes(role) })),
    );
    expect(overridesFromShelby(rows)).toEqual([]);
  });

  it("keeps a café's own changes, and never widens access", () => {
    const rows = [
      { role: "barista", resource: "api:expenses:write", allowed: false },
      { role: "chef", resource: "page:/admin/products", allowed: true },
      { role: "chef", resource: "api:products:write", allowed: true },
      { role: "chef", resource: "api:categories:write", allowed: true },
      { role: "barista", resource: "page:/admin/inventory", allowed: true },
      { role: "barista", resource: "api:inventory:read", allowed: false },
      { role: "admin", resource: "page:/", allowed: false },
    ];
    expect(overridesFromShelby(rows)).toEqual([
      { role: "chef", permission: "menu.edit", allowed: true },
      { role: "barista", permission: "bills.add", allowed: false },
    ]);
  });
});

describe("InMemoryStaffStore", () => {
  it("finds accounts by email in any case and hides removed members", async () => {
    const store = new InMemoryStaffStore();
    await store.saveAccount({ id: "a1", email: " Selin@Moda.TEST ", name: "Selin", passwordHash: null, customerId: null, disabledAt: null });
    expect((await store.getAccountByEmail("selin@moda.test"))?.id).toBe("a1");
    const base = { cafeId: "moda", accountId: "a1", role: "barista" as const, removedAt: null, ...NO_PIN };
    await store.saveMember({ ...base, id: "m1", createdAt: new Date(1) });
    await store.saveMember({ ...base, id: "m2", cafeId: "kuzguncuk", createdAt: new Date(2), removedAt: new Date(3) });
    expect((await store.membershipsOf("a1")).map((m) => m.id)).toEqual(["m1"]);
    expect((await store.memberAt("a1", "kuzguncuk"))?.removedAt).toEqual(new Date(3));
  });
});
