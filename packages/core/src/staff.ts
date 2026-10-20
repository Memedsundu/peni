/**
 * Staff, roles and what each role may do. Plan piece 2.
 *
 * Based on Shelby's roles: Shelby's admin is Peni's owner; manager, chef and
 * barista keep their names and their default access. Each café can turn a
 * permission on or off per role, except the owner (always everything) and the
 * locked permissions (always their defaults), as in Shelby.
 *
 * Permissions follow the café panel's sections (design.md), so the roles screen
 * reads like the menu the staff member sees.
 */

export const STAFF_ROLES = ["owner", "manager", "chef", "barista"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
/** The roles a café can adjust. The owner always has every permission. */
export type AdjustableRole = Exclude<StaffRole, "owner">;
export const ADJUSTABLE_ROLES = STAFF_ROLES.filter((r): r is AdjustableRole => r !== "owner");

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export interface Text {
  tr: string;
  en: string;
}

export const ROLE_LABELS: Record<StaffRole, Text> = {
  owner: { tr: "Sahip", en: "Owner" },
  manager: { tr: "Müdür", en: "Manager" },
  chef: { tr: "Şef", en: "Chef" },
  barista: { tr: "Barista", en: "Barista" },
};

/** The café panel's sections, in menu order. */
export const SECTIONS = {
  today: { tr: "Bugün", en: "Today" },
  till: { tr: "Satış ekranı", en: "Till" },
  menu: { tr: "Menü", en: "Menu" },
  bills: { tr: "Faturalar", en: "Bills" },
  suppliers: { tr: "Tedarikçiler", en: "Suppliers" },
  stock: { tr: "Stok", en: "Stock" },
  cash: { tr: "Nakit ve banka", en: "Cash and bank" },
  debts: { tr: "Borçlar", en: "Debts" },
  shifts: { tr: "Vardiyalar", en: "Shifts" },
  pay: { tr: "Puantaj ve maaş", en: "Hours and pay" },
  tasks: { tr: "Görevler", en: "Tasks" },
  peni: { tr: "Penny ve askı", en: "Pennies and askı" },
  posts: { tr: "Paylaşımlar", en: "Posts and events" },
  reports: { tr: "Raporlar", en: "Reports" },
  assistant: { tr: "Asistan", en: "Assistant" },
  settings: { tr: "Ayarlar", en: "Settings" },
} as const satisfies Record<string, Text>;
export type Section = keyof typeof SECTIONS;

export interface PermissionDefinition {
  section: Section;
  /** What the switch is called. */
  label: Text;
  /** One line under it: what turning it on lets someone do. */
  hint: Text;
  /** Who has it unless the café changes it. The owner always has it. */
  roles: readonly AdjustableRole[];
  /** Cannot be changed per café: money, reports, the assistant and the team stay with these roles. */
  locked?: true;
  /** Also works after a PIN sign-in at the till. Everything else needs the password. */
  atTill?: true;
}

const ALL = ["manager", "chef", "barista"] as const;
const BACK = ["manager", "chef"] as const;
const MANAGER = ["manager"] as const;
const OWNER = [] as const;

export const PERMISSIONS = {
  "today.view": {
    section: "today",
    label: { tr: "Bugün'ü görür", en: "Sees Today" },
    hint: { tr: "Düşük stok, vadesi gelen faturalar, kasa farkları ve günün satışları.", en: "Low stock, bills due, cash differences and today's sales." },
    roles: BACK,
  },
  "till.use": {
    section: "till",
    label: { tr: "Satış yapar", en: "Takes orders" },
    hint: { tr: "Satış ekranında sipariş alır, ödemeyi kaydeder.", en: "Takes orders and records payments on the till." },
    roles: ALL,
    atTill: true,
  },
  "till.history": {
    section: "till",
    label: { tr: "Geçmiş siparişleri görür", en: "Sees past orders" },
    hint: { tr: "Bugünün ve önceki günlerin siparişleri.", en: "Today's and earlier orders." },
    roles: ALL,
    atTill: true,
  },
  "till.correct": {
    section: "till",
    label: { tr: "İptal ve iade yapar", en: "Voids and refunds" },
    hint: { tr: "Bir siparişi iptal eder ya da parasını geri verir.", en: "Voids an order or gives the money back." },
    roles: MANAGER,
    atTill: true,
  },
  "till.delete": {
    section: "till",
    label: { tr: "Sipariş siler", en: "Deletes orders" },
    hint: {
      tr: "Siparişi satışlardan ve raporlardan kaldırır; kim, ne zaman ve neden sildiği saklanır. İptal çoğu zaman yeterli.",
      en: "Takes an order out of sales and reports; who deleted it, when and why is kept. A void is usually enough.",
    },
    roles: OWNER,
  },
  "menu.edit": {
    section: "menu",
    label: { tr: "Menüyü düzenler", en: "Edits the menu" },
    hint: { tr: "Ürünler, fiyatlar ve kategoriler.", en: "Products, prices and categories." },
    roles: MANAGER,
  },
  "menu.recipes": {
    section: "menu",
    label: { tr: "Reçeteleri düzenler", en: "Edits recipes" },
    hint: { tr: "Bir ürünün içinde ne olduğu; stok bundan düşer.", en: "What goes into each product; stock is used from it." },
    roles: BACK,
  },
  "bills.view": {
    section: "bills",
    label: { tr: "Faturaları görür", en: "Sees bills" },
    hint: { tr: "Gelen fatura ve fişler.", en: "Bills and receipts received." },
    roles: ALL,
  },
  "bills.add": {
    section: "bills",
    label: { tr: "Fatura ekler", en: "Adds bills" },
    hint: { tr: "Bir fiş ya da faturanın fotoğrafını çekip ekler.", en: "Photographs a receipt or bill and adds it." },
    roles: ALL,
    atTill: true,
  },
  "bills.manage": {
    section: "bills",
    label: { tr: "Faturaları düzeltir ve öder", en: "Corrects and pays bills" },
    hint: { tr: "Faturayı düzeltir, siler ya da ödendi olarak işaretler.", en: "Corrects or deletes a bill, or marks it paid." },
    roles: MANAGER,
    locked: true,
  },
  "suppliers.view": {
    section: "suppliers",
    label: { tr: "Tedarikçileri görür", en: "Sees suppliers" },
    hint: { tr: "Kimden alındığı, ne kadar borç olduğu, fiyatlar.", en: "Who you buy from, what you owe, their prices." },
    roles: BACK,
  },
  "suppliers.edit": {
    section: "suppliers",
    label: { tr: "Tedarikçileri düzenler", en: "Edits suppliers" },
    hint: { tr: "Tedarikçi ekler ve bilgilerini günceller.", en: "Adds suppliers and updates their details." },
    roles: BACK,
  },
  "stock.view": {
    section: "stock",
    label: { tr: "Stoku görür", en: "Sees stock" },
    hint: { tr: "Malzemeler, sayımlar ve azalanlar.", en: "Ingredients, counts and what is running low." },
    roles: BACK,
  },
  "stock.edit": {
    section: "stock",
    label: { tr: "Stok sayar ve düzeltir", en: "Counts and adjusts stock" },
    hint: { tr: "Sayım girer, fire ve teslimat kaydeder.", en: "Enters counts, records waste and deliveries." },
    roles: BACK,
  },
  "cash.drawer": {
    section: "cash",
    label: { tr: "Kasayı açar ve kapatır", en: "Opens and closes the drawer" },
    hint: { tr: "Gün başı ve gün sonu nakit sayımı.", en: "The cash count at opening and closing." },
    roles: ALL,
    atTill: true,
  },
  "cash.manage": {
    section: "cash",
    label: { tr: "Nakit ve bankayı yönetir", en: "Manages cash and bank" },
    hint: { tr: "Kasa, ayrı kasa ve banka arasında para hareketi; ayrı kasadan ödeme.", en: "Moves money between the drawer, the reserve and the bank; pays from the reserve." },
    roles: MANAGER,
    locked: true,
  },
  "cash.periods": {
    section: "cash",
    label: { tr: "Ayı kapatır", en: "Closes the month" },
    hint: {
      tr: "Biten ayın rakamlarını saklar; o aya ve öncesine kayıt eklenemez, değiştirilemez. Yeniden açabilir.",
      en: "Keeps the finished month's numbers; nothing in it or before it can be added or changed. Can reopen it.",
    },
    roles: OWNER,
    locked: true,
  },
  "debts.view": {
    section: "debts",
    label: { tr: "Borçları görür", en: "Sees debts" },
    hint: { tr: "Tedarikçi borçları, çekler ve krediler.", en: "Supplier debts, checks and loans." },
    roles: BACK,
  },
  "debts.edit": {
    section: "debts",
    label: { tr: "Borçları düzenler", en: "Edits debts" },
    hint: { tr: "Çek ve borç ekler, ödemeleri kaydeder.", en: "Adds checks and debts, records payments." },
    roles: BACK,
  },
  "debts.card": {
    section: "debts",
    label: { tr: "Kredi kartını yönetir", en: "Manages the credit card" },
    hint: { tr: "Kart harcamaları ve ödemeleri.", en: "Card spending and payments." },
    roles: MANAGER,
    locked: true,
  },
  "shifts.view": {
    section: "shifts",
    label: { tr: "Vardiyaları görür", en: "Sees shifts" },
    hint: { tr: "Kim ne zaman çalışıyor.", en: "Who works when." },
    roles: ALL,
    atTill: true,
  },
  "shifts.edit": {
    section: "shifts",
    label: { tr: "Vardiya planlar", en: "Plans shifts" },
    hint: { tr: "Haftalık planı hazırlar ve değiştirir.", en: "Makes and changes the weekly plan." },
    roles: BACK,
  },
  "pay.hours": {
    section: "pay",
    label: { tr: "Puantajı görür ve düzeltir", en: "Sees and corrects hours" },
    hint: { tr: "Çalışılan saatler ve dışa aktarma.", en: "Hours worked, and exporting them." },
    roles: BACK,
  },
  "pay.payouts": {
    section: "pay",
    label: { tr: "Maaş ödemesi kaydeder", en: "Records pay" },
    hint: { tr: "Kime ne kadar ödendiği.", en: "What each person was paid." },
    roles: BACK,
  },
  "pay.close": {
    section: "pay",
    label: { tr: "Ayı kapatır", en: "Closes the month" },
    hint: { tr: "Maaş ayını kapatır ya da yeniden açar.", en: "Closes a pay month, or opens it again." },
    roles: MANAGER,
  },
  "tasks.view": {
    section: "tasks",
    label: { tr: "Görevleri görür ve yapar", en: "Sees and does tasks" },
    hint: { tr: "Açılış, kapanış ve temizlik listeleri.", en: "Opening, closing and cleaning checklists." },
    roles: ALL,
    atTill: true,
  },
  "tasks.edit": {
    section: "tasks",
    label: { tr: "Görev listelerini düzenler", en: "Edits task lists" },
    hint: { tr: "Listeleri hazırlar ve kime düştüğünü seçer.", en: "Makes the lists and chooses who gets them." },
    roles: BACK,
  },
  "peni.view": {
    section: "peni",
    label: { tr: "Penny ve askı rakamlarını görür", en: "Sees pennies and askı numbers" },
    hint: { tr: "Verilen ve harcanan penny, askıdaki tutar, üye sayısı.", en: "Pennies given and spent, what is on the askı, members." },
    roles: MANAGER,
  },
  "peni.till": {
    section: "peni",
    label: { tr: "Askıya nakit ekler", en: "Adds cash to the askı" },
    hint: { tr: "Bir misafir askı için nakit bıraktığında kaydeder.", en: "Records it when a guest leaves cash for the askı." },
    roles: ALL,
    atTill: true,
  },
  "posts.write": {
    section: "posts",
    label: { tr: "Kafe adına paylaşır", en: "Posts for the café" },
    hint: { tr: "Akışa paylaşım ve etkinlik ekler.", en: "Adds posts and events to the feed." },
    roles: MANAGER,
  },
  "posts.moderate": {
    section: "posts",
    label: { tr: "Topluluğu düzenler", en: "Moderates the community" },
    hint: { tr: "Yorum gizler, şikâyetlere bakar, gerekirse üyeyi durdurur.", en: "Hides comments, handles reports, pauses a member if needed." },
    roles: MANAGER,
  },
  "reports.view": {
    section: "reports",
    label: { tr: "Raporları görür", en: "Sees reports" },
    hint: { tr: "Satış, maliyet ve kâr.", en: "Sales, costs and profit." },
    roles: MANAGER,
    locked: true,
  },
  "assistant.use": {
    section: "assistant",
    label: { tr: "Asistanı kullanır", en: "Uses the assistant" },
    hint: { tr: "Kafenin rakamlarıyla soru sorar, taslak hazırlatır.", en: "Asks about the café's numbers and has drafts prepared." },
    roles: MANAGER,
    locked: true,
  },
  "team.view": {
    section: "settings",
    label: { tr: "Ekibi görür", en: "Sees the team" },
    hint: { tr: "Kimin hangi rolde çalıştığı.", en: "Who works here and in which role." },
    roles: BACK,
  },
  "team.manage": {
    section: "settings",
    label: { tr: "Ekibi yönetir", en: "Manages the team" },
    hint: { tr: "Kişi ekler, rolünü değiştirir, çıkarır.", en: "Adds people, changes their role, removes them." },
    roles: OWNER,
    locked: true,
  },
  "roles.manage": {
    section: "settings",
    label: { tr: "Rolleri düzenler", en: "Edits roles" },
    hint: { tr: "Bu ekrandaki izinleri değiştirir.", en: "Changes the permissions on this screen." },
    roles: OWNER,
    locked: true,
  },
  "settings.edit": {
    section: "settings",
    label: { tr: "Kafe ayarlarını değiştirir", en: "Changes café settings" },
    hint: { tr: "Kafe bilgileri, penny oranı, askı kuralları.", en: "Café details, penny rate, askı rules." },
    roles: OWNER,
  },
  "devices.manage": {
    section: "settings",
    label: { tr: "Cihazları yönetir", en: "Manages devices" },
    hint: { tr: "Satış ekranı ve müşteri ekranı olan bilgisayarlar.", en: "The computers running the till and the customer screen." },
    roles: OWNER,
  },
} as const satisfies Record<string, PermissionDefinition>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

function definition(permission: Permission): PermissionDefinition {
  return PERMISSIONS[permission];
}

/** What a PIN sign-in at the till can do, at most: the till's own work. */
export const TILL_PERMISSIONS = ALL_PERMISSIONS.filter((p) => definition(p).atTill === true);

export function isLocked(permission: Permission): boolean {
  return definition(permission).locked === true;
}

export function isDefaultFor(role: AdjustableRole, permission: Permission): boolean {
  return definition(permission).roles.includes(role);
}

/** A café's change to one role's permission. Only differences from the defaults are stored. */
export interface RoleOverride {
  role: AdjustableRole;
  permission: Permission;
  allowed: boolean;
}

export type RoleMatrix = Record<StaffRole, Record<Permission, boolean>>;

/** Every role's permissions at a café: the defaults with the café's changes on top. */
export function roleMatrix(overrides: readonly RoleOverride[]): RoleMatrix {
  const matrix = {} as RoleMatrix;
  for (const role of STAFF_ROLES) {
    matrix[role] = {} as Record<Permission, boolean>;
    for (const p of ALL_PERMISSIONS) matrix[role][p] = role === "owner" || isDefaultFor(role, p);
  }
  for (const o of overrides) {
    if (o.role === ("owner" as StaffRole) || !isPermission(o.permission) || isLocked(o.permission)) continue;
    matrix[o.role][o.permission] = o.allowed;
  }
  return matrix;
}

export function permissionsFor(role: StaffRole, overrides: readonly RoleOverride[]): Set<Permission> {
  const row = roleMatrix(overrides)[role];
  return new Set(ALL_PERMISSIONS.filter((p) => row[p]));
}

/**
 * What to store for a matrix the owner saved: only the differences from the
 * defaults, ignoring the owner row, locked permissions and unknown keys. New
 * permissions added later then start at their defaults everywhere.
 */
export function overridesFrom(input: Partial<Record<string, Partial<Record<string, boolean>>>>): RoleOverride[] {
  const out: RoleOverride[] = [];
  for (const role of ADJUSTABLE_ROLES) {
    const row = input[role] ?? {};
    for (const permission of ALL_PERMISSIONS) {
      if (isLocked(permission)) continue;
      const allowed = row[permission];
      if (typeof allowed !== "boolean" || allowed === isDefaultFor(role, permission)) continue;
      out.push({ role, permission, allowed });
    }
  }
  return out;
}

/**
 * Shelby's permission keys and the Peni permissions each one became, for moving
 * a café's own role settings across at switch-over (plan piece 35). Page and API
 * keys collapse into one switch per action.
 */
export const FROM_SHELBY: Record<string, readonly Permission[]> = {
  "page:/": ["till.use"],
  "page:/orders": ["till.history"],
  "page:/admin/cash": ["cash.drawer"],
  "api:cash:read": ["cash.drawer"],
  "api:cash:count": ["cash.drawer"],
  "api:money:manage": ["cash.manage"],
  "page:/admin/dashboard": ["today.view"],
  "api:dashboard:read": ["today.view"],
  "page:/admin/alerts": ["today.view"],
  "api:alerts:read": ["today.view"],
  "page:/admin/products": ["menu.edit"],
  "api:products:write": ["menu.edit"],
  "api:categories:write": ["menu.edit"],
  "api:recipes:write": ["menu.recipes"],
  "page:/admin/inventory": ["stock.view"],
  "api:inventory:read": ["stock.view"],
  "api:inventory:movements:read": ["stock.view"],
  "api:inventory:deliveries:read": ["stock.view"],
  "api:inventory:write": ["stock.edit"],
  "api:inventory:deliveries:write": ["stock.edit"],
  "api:stock-categories:write": ["stock.edit"],
  "api:stock:write": ["stock.edit"],
  "page:/admin/expenses": ["bills.view"],
  "api:expenses:read": ["bills.view"],
  "api:expenses:write": ["bills.add"],
  "api:expenses:manage": ["bills.manage"],
  "page:/admin/suppliers": ["suppliers.view"],
  "api:suppliers:read": ["suppliers.view"],
  "api:suppliers:write": ["suppliers.edit"],
  "page:/admin/checks": ["debts.view"],
  "api:checks:read": ["debts.view"],
  "api:debts:read": ["debts.view"],
  "api:checks:write": ["debts.edit"],
  "api:debts:write": ["debts.edit"],
  "page:/admin/credit-card": ["debts.card"],
  "api:credit-card:read": ["debts.card"],
  "api:credit-card:write": ["debts.card"],
  "page:/admin/shifts": ["shifts.view"],
  "api:shifts:read": ["shifts.view"],
  "api:shifts:write": ["shifts.edit"],
  "page:/admin/payroll": ["pay.hours"],
  "api:timesheets:read": ["pay.hours"],
  "api:timesheets:write": ["pay.hours"],
  "api:timesheets:export": ["pay.hours"],
  "api:payroll:read": ["pay.hours"],
  "api:timesheets:payout:write": ["pay.payouts"],
  "api:payroll:close": ["pay.close"],
  "api:payroll:reopen": ["pay.close"],
  "page:/admin/tasks": ["tasks.view"],
  "api:tasks:read": ["tasks.view"],
  "api:tasks:complete": ["tasks.view"],
  "api:tasks:templates:write": ["tasks.edit"],
  "page:/admin/reports": ["reports.view"],
  "api:reports:read": ["reports.view"],
  "api:reports:analytics:read": ["reports.view"],
  "page:/admin/assistant": ["assistant.use"],
  "api:ai:use": ["assistant.use"],
  "api:orders:correct": ["till.correct"],
  "api:orders:delete": ["till.delete"],
  "api:team:staff:read": ["team.view"],
  "page:/admin/team": ["team.manage"],
  "api:team:all": ["team.manage"],
  "api:permissions:write": ["roles.manage"],
  "page:/admin/settings": ["settings.edit"],
  "api:cafe-settings:write": ["settings.edit"],
  "api:pos-config:write": ["devices.manage"],
};

/**
 * Turns a Shelby café's stored role switches into Peni's. A Peni permission made
 * from several Shelby keys is on only when all of them were on, so nobody gains
 * access at switch-over. Shelby's admin becomes owner and needs no rows.
 */
export function overridesFromShelby(rows: readonly { role: string; resource: string; allowed: boolean }[]): RoleOverride[] {
  const merged: Partial<Record<string, Partial<Record<Permission, boolean>>>> = {};
  for (const row of rows) {
    if (row.role === "admin" || !isStaffRole(row.role)) continue;
    const perRole = (merged[row.role] ??= {});
    for (const p of FROM_SHELBY[row.resource] ?? []) perRole[p] = (perRole[p] ?? true) && row.allowed;
  }
  return overridesFrom(merged);
}

// ─────────────────────────────────────────────── accounts, memberships, sessions

/** A person who works at one or more cafés. Signs in with email and password. */
export interface StaffAccount {
  id: string;
  /** Lower case. */
  email: string;
  name: string;
  /** bcrypt, as in Shelby, so Shelby passwords keep working. Null until set. */
  passwordHash: string | null;
  /** The same person's customer profile, when linked. */
  customerId: string | null;
  disabledAt: Date | null;
}

/** One account's role at one café. */
export interface StaffMember {
  id: string;
  cafeId: string;
  accountId: string;
  role: StaffRole;
  createdAt: Date;
  /** Taken off the team; the account keeps its other cafés. */
  removedAt: Date | null;
  /** bcrypt of the till PIN, set by the staff member themselves. */
  pinHash: string | null;
  /** Wrong PINs in a row; a right one resets it. */
  pinFailures: number;
  pinLockedUntil: Date | null;
}

/** A new team member's PIN fields: no PIN yet. */
export const NO_PIN = { pinHash: null, pinFailures: 0, pinLockedUntil: null } as const;

export type StaffSignInMethod = "password" | "pin";

export interface StaffSessionRecord {
  accountId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  method: StaffSignInMethod;
  /** PIN sessions belong to one café and one till device. Null for password sessions. */
  cafeId: string | null;
  deviceId: string | null;
}

/** A computer at the café that runs the till. Baristas sign in on it with their PIN. */
export interface TillDevice {
  id: string;
  cafeId: string;
  name: string;
  createdAt: Date;
  /** The staff member who set it up. */
  createdByMemberId: string;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
}

/** Why a PIN is not accepted, or null. 4 to 6 digits; no 1111, 1234 or 4321. */
export function pinProblem(pin: string): "PIN_FORMAT" | "PIN_TOO_EASY" | null {
  if (!/^\d{4,6}$/.test(pin)) return "PIN_FORMAT";
  const d = [...pin].map(Number);
  const steps = new Set(d.slice(1).map((x, i) => x - d[i]!));
  if (steps.size === 1 && [0, 1, -1].includes([...steps][0]!)) return "PIN_TOO_EASY";
  return null;
}

export interface StaffStore {
  getAccount(id: string): Promise<StaffAccount | null>;
  getAccountByEmail(email: string): Promise<StaffAccount | null>;
  accountForCustomer(customerId: string): Promise<StaffAccount | null>;
  saveAccount(account: StaffAccount): Promise<void>;

  getMember(id: string): Promise<StaffMember | null>;
  /** The account's membership at a café, removed or not. */
  memberAt(accountId: string, cafeId: string): Promise<StaffMember | null>;
  /** A café's team, oldest first, without removed members. */
  listMembers(cafeId: string): Promise<StaffMember[]>;
  /** An account's cafés, oldest first, without removed memberships. */
  membershipsOf(accountId: string): Promise<StaffMember[]>;
  saveMember(member: StaffMember): Promise<void>;

  /** Stores only the hash of a session token. A PIN session names its café and device. */
  createSession(
    accountId: string,
    tokenHash: string,
    expiresAt: Date,
    pin?: { cafeId: string; deviceId: string },
  ): Promise<void>;
  sessionFor(tokenHash: string): Promise<StaffSessionRecord | null>;
  revokeSession(tokenHash: string, at: Date): Promise<void>;
  /** Signs the account out everywhere except, optionally, one session. */
  revokeSessionsOf(accountId: string, at: Date, exceptTokenHash?: string): Promise<void>;
  /** Ends every PIN session on a device. */
  revokeSessionsOnDevice(deviceId: string, at: Date): Promise<void>;

  /** Stores only the hash of the device token. */
  createDevice(device: TillDevice, tokenHash: string): Promise<void>;
  getDevice(id: string): Promise<TillDevice | null>;
  deviceForToken(tokenHash: string): Promise<TillDevice | null>;
  /** A café's devices, oldest first, without revoked ones. */
  listDevices(cafeId: string): Promise<TillDevice[]>;
  saveDevice(device: TillDevice): Promise<void>;

  /** Failed sign-ins, kept for the per-email limit. */
  recordFailedSignIn(email: string, at: Date): Promise<void>;
  countFailedSignIns(email: string, since: Date): Promise<number>;

  listOverrides(cafeId: string): Promise<RoleOverride[]>;
  replaceOverrides(cafeId: string, overrides: readonly RoleOverride[]): Promise<void>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class InMemoryStaffStore implements StaffStore {
  private readonly accounts = new Map<string, StaffAccount>();
  private readonly members = new Map<string, StaffMember>();
  private readonly sessions = new Map<string, StaffSessionRecord>();
  private readonly failures = new Map<string, Date[]>();
  private readonly overrides = new Map<string, RoleOverride[]>();
  private readonly devices = new Map<string, { device: TillDevice; tokenHash: string }>();

  async getAccount(id: string) {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }

  async getAccountByEmail(email: string) {
    const a = [...this.accounts.values()].find((x) => x.email === normalizeEmail(email));
    return a ? { ...a } : null;
  }

  async accountForCustomer(customerId: string) {
    const a = [...this.accounts.values()].find((x) => x.customerId === customerId);
    return a ? { ...a } : null;
  }

  async saveAccount(account: StaffAccount) {
    this.accounts.set(account.id, { ...account, email: normalizeEmail(account.email) });
  }

  async getMember(id: string) {
    const m = this.members.get(id);
    return m ? { ...m } : null;
  }

  async memberAt(accountId: string, cafeId: string) {
    const m = [...this.members.values()].find((x) => x.accountId === accountId && x.cafeId === cafeId);
    return m ? { ...m } : null;
  }

  async listMembers(cafeId: string) {
    return this.active((m) => m.cafeId === cafeId);
  }

  async membershipsOf(accountId: string) {
    return this.active((m) => m.accountId === accountId);
  }

  async saveMember(member: StaffMember) {
    this.members.set(member.id, { ...member });
  }

  async createSession(accountId: string, tokenHash: string, expiresAt: Date, pin?: { cafeId: string; deviceId: string }) {
    this.sessions.set(tokenHash, {
      accountId,
      expiresAt,
      revokedAt: null,
      method: pin ? "pin" : "password",
      cafeId: pin?.cafeId ?? null,
      deviceId: pin?.deviceId ?? null,
    });
  }

  async sessionFor(tokenHash: string) {
    const s = this.sessions.get(tokenHash);
    return s ? { ...s } : null;
  }

  async revokeSession(tokenHash: string, at: Date) {
    const s = this.sessions.get(tokenHash);
    if (s && !s.revokedAt) s.revokedAt = at;
  }

  async revokeSessionsOf(accountId: string, at: Date, exceptTokenHash?: string) {
    for (const [hash, s] of this.sessions) {
      if (s.accountId === accountId && !s.revokedAt && hash !== exceptTokenHash) s.revokedAt = at;
    }
  }

  async revokeSessionsOnDevice(deviceId: string, at: Date) {
    for (const s of this.sessions.values()) if (s.deviceId === deviceId && !s.revokedAt) s.revokedAt = at;
  }

  async createDevice(device: TillDevice, tokenHash: string) {
    this.devices.set(device.id, { device: { ...device }, tokenHash });
  }

  async getDevice(id: string) {
    const d = this.devices.get(id);
    return d ? { ...d.device } : null;
  }

  async deviceForToken(tokenHash: string) {
    const d = [...this.devices.values()].find((x) => x.tokenHash === tokenHash);
    return d ? { ...d.device } : null;
  }

  async listDevices(cafeId: string) {
    return [...this.devices.values()]
      .map((d) => d.device)
      .filter((d) => d.cafeId === cafeId && !d.revokedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((d) => ({ ...d }));
  }

  async saveDevice(device: TillDevice) {
    const d = this.devices.get(device.id);
    if (d) d.device = { ...device };
  }

  async recordFailedSignIn(email: string, at: Date) {
    const key = normalizeEmail(email);
    this.failures.set(key, [...(this.failures.get(key) ?? []), at]);
  }

  async countFailedSignIns(email: string, since: Date) {
    return (this.failures.get(normalizeEmail(email)) ?? []).filter((t) => t > since).length;
  }

  async listOverrides(cafeId: string) {
    return (this.overrides.get(cafeId) ?? []).map((o) => ({ ...o }));
  }

  async replaceOverrides(cafeId: string, overrides: readonly RoleOverride[]) {
    this.overrides.set(cafeId, overrides.map((o) => ({ ...o })));
  }

  private active(match: (m: StaffMember) => boolean): StaffMember[] {
    return [...this.members.values()]
      .filter((m) => !m.removedAt && match(m))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({ ...m }));
  }
}
