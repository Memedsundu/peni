/**
 * §11 banned list. Greps `apps/*\/src` and `packages/api/src/messages.ts` (and this package's
 * own shared strings) and fails on any banned word, character or pattern.
 *
 * Strings and JSX text are checked; comments are blanked first (line numbers are kept), so a
 * comment may name a banned word to explain it. `textTransform` is the exception: mobile
 * sources must not contain it at all, comments included (§17 greps for it).
 *
 * This test MUST pass at the end of the redesign, with ALLOWLIST empty.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * legacy screens — remove when migrated.
 * Files that broke the banned list when the lint landed (16 Oct 2026). Their violations are
 * still reported (console.warn) but don't fail the build. Delete each entry as its screen is
 * rewritten; a stale entry (file gone or clean) is reported too.
 */
const ALLOWLIST: string[] = [
  // Empty since the foundation integration pass: every legacy screen was brought under the
  // lint. Keep it empty; fix the copy instead of adding a file here.
];

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/* ========================================================================================== */
/* Rules                                                                                      */
/* ========================================================================================== */

type Scope = "all" | "web" | "mobile";

interface Rule {
  id: string;
  why: string;
  pattern: RegExp;
  scope: Scope;
  /** Check the raw source, comments included. */
  raw?: boolean;
  /** Paths this rule does not apply to. */
  skip?: RegExp;
}

/** Staff-only surfaces: "Reddedildi" is banned in customer copy only. */
const STAFF_PATH =
  /^apps\/web\/src\/app\/(?:\(staff\)\/|kafe\/)|^apps\/mobile\/src\/app\/\(staff\)\/|\/staff[/-]|\/staff\.[cm]?[jt]sx?$/;

/** Goods words that must never be fractional ("1,5 çay"). */
const GOODS = "(?:çay|çayı|kahve|kahvesi|simit|fincan|bardak|ikram|latte|poğaça|salep|sahlep|limonata|su)";

export const RULES: Rule[] = [
  {
    id: "penisi",
    why: '"penisi", "penisini", "penisine" read as vulgar. Use "penin", "peniyi", "peniye", "peniden".',
    pattern: /(?<!\p{L})[pP]enis[iİ]/u,
    scope: "all",
  },
  {
    id: "peni-apostrophe",
    why: "peni is a common noun and takes no apostrophe (\"penin\", not \"peni'n\").",
    pattern: /(?<!\p{L})peni['’](?=\p{L})/u,
    scope: "all",
  },
  {
    id: "askin",
    why: '"askın" is easily misread as "aşkın". Use "ikramın".',
    pattern: /(?<!\p{L})(?:[aA]skın|ASKIN(?!\p{L}))/u,
    scope: "all",
  },
  {
    id: "kasada-kod-de",
    why: 'Use "Kasada P-003 kodunu söyle", not "Kasada P-003 de".',
    pattern: /Kasada\s+(?:P-\d+|\$?\{[^{}]*\})\s+de(?!\p{L})/u,
    scope: "all",
  },
  {
    id: "tl0-ode",
    why: 'Use "Ödeme yok", not "₺0 öde".',
    pattern: /₺\s?0(?:,00)?\s+öde/u,
    scope: "all",
  },
  {
    id: "fractional-goods",
    why: "Only whole items are ever shown (D9): no \"1,5 çay\".",
    pattern: new RegExp(`(?:\\d+(?:,\\d+|\\.\\d{1,2}(?!\\d))|½|yarım|buçuk)\\s+${GOODS}(?!\\p{L})`, "iu"),
    scope: "all",
  },
  {
    id: "ihtiyac",
    why: 'Askı is universal: no "İhtiyacın varsa", no "ihtiyaç sahibi".',
    pattern: /[İi]htiyacın\s+varsa|[İi]htiyaç\s+sahi[bp]/u,
    scope: "all",
  },
  {
    id: "reddedildi",
    why: 'No blame in customer copy: "Kafe yetişemedi", never "Reddedildi".',
    pattern: /(?<!\p{L})[Rr]eddedildi/u,
    scope: "all",
    skip: STAFF_PATH,
  },
  {
    id: "demo-colon",
    why: '"Demo:" hints are removed from production copy; the fenced demo box says "DENEME".',
    pattern: /(?<!\p{L})Demo:/u,
    scope: "all",
    skip: /demo/i,
  },
  {
    id: "web-glyphs",
    why: "The web font subsets lack ≈ → ✓ ☞ ❦ (D23): use <Approx/>, lucide ArrowRight, Check.",
    pattern: /[≈→✓☞❦]/u,
    scope: "web",
  },
  {
    id: "glyphs",
    why: "Neither family has ✓ ☞ ❦ (§4.1): use lucide icons.",
    pattern: /[✓☞❦]/u,
    scope: "mobile",
  },
  {
    id: "emoji",
    why: "No emoji anywhere (§5 Icons).",
    pattern: /(?![©®™])\p{Extended_Pictographic}/u,
    scope: "all",
  },
  {
    id: "textTransform",
    why: "Mobile caps go through trUpper() (§4.3); textTransform breaks the Turkish i.",
    pattern: /textTransform/,
    scope: "mobile",
    raw: true,
  },
  {
    id: "cafe-name-suffix",
    why: "No suffix after a dynamic café name (G10): rephrase with \"için\" or use a legend.",
    pattern: /\{[^{}]*(?:cafe|kafe|Cafe|Kafe)[^{}]*\}['’]\p{L}/u,
    scope: "all",
  },
];

/* ========================================================================================== */
/* Files                                                                                      */
/* ========================================================================================== */

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json"]);
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (EXTENSIONS.has(extname(name)) && !TEST_FILE.test(name)) out.push(path);
  }
  return out;
}

function targets(): string[] {
  const files: string[] = [];
  for (const app of readdirSync(join(ROOT, "apps"))) {
    const src = join(ROOT, "apps", app, "src");
    if (existsSync(src)) files.push(...walk(src));
  }
  for (const f of ["packages/api/src/messages.ts", "packages/brand/src/copy.ts", "packages/brand/src/format.ts"]) {
    if (existsSync(join(ROOT, f))) files.push(join(ROOT, f));
  }
  return files.map((f) => relative(ROOT, f).split("\\").join("/")).sort();
}

function scopeOf(path: string): "web" | "mobile" {
  return path.startsWith("apps/mobile/") ? "mobile" : "web"; // packages ship to both: hold them to the web rules
}

/* ========================================================================================== */
/* Comment stripping (keeps every newline, so line numbers survive)                           */
/* ========================================================================================== */

export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let mode: "code" | "line" | "block" | "sq" | "dq" | "tpl" | "regex" = "code";
  let depth = 0;
  const tpl: number[] = [];
  let prev = "";
  let inClass = false;
  const blank = (s: string) => s.replace(/[^\n]/g, " ");

  while (i < src.length) {
    const c = src[i]!;
    const d = src[i + 1];
    switch (mode) {
      case "code": {
        if (c === "/" && d === "/") {
          mode = "line";
          out += "  ";
          i += 2;
          continue;
        }
        if (c === "/" && d === "*") {
          mode = "block";
          out += "  ";
          i += 2;
          continue;
        }
        if (c === "'") mode = "sq";
        else if (c === '"') mode = "dq";
        else if (c === "`") mode = "tpl";
        else if (c === "/" && (prev === "" || "(,=:[!&|?{};+-*%<>~^".includes(prev))) {
          mode = "regex";
          inClass = false;
        } else if (c === "{") depth++;
        else if (c === "}") {
          if (tpl.length && tpl[tpl.length - 1] === depth) {
            tpl.pop();
            mode = "tpl";
          } else depth--;
        }
        if (!/\s/.test(c)) prev = c;
        out += c;
        i++;
        continue;
      }
      case "line":
        if (c === "\n") {
          mode = "code";
          out += c;
        } else out += " ";
        i++;
        continue;
      case "block":
        if (c === "*" && d === "/") {
          mode = "code";
          out += "  ";
          i += 2;
          continue;
        }
        out += blank(c);
        i++;
        continue;
      case "sq":
      case "dq": {
        if (c === "\\" && d !== undefined) {
          out += c + d;
          i += 2;
          continue;
        }
        // An apostrophe in JSX text is not a string: give up at the end of the line.
        if ((mode === "sq" && c === "'") || (mode === "dq" && c === '"') || c === "\n") {
          mode = "code";
          prev = c === "\n" ? prev : c;
        }
        out += c;
        i++;
        continue;
      }
      case "tpl": {
        if (c === "\\" && d !== undefined) {
          out += c + d;
          i += 2;
          continue;
        }
        if (c === "`") {
          mode = "code";
          prev = c;
        } else if (c === "$" && d === "{") {
          tpl.push(depth);
          mode = "code";
          prev = "{";
          out += "${";
          i += 2;
          continue;
        }
        out += c;
        i++;
        continue;
      }
      case "regex": {
        if (c === "\\" && d !== undefined) {
          out += c + d;
          i += 2;
          continue;
        }
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if ((c === "/" && !inClass) || c === "\n") {
          mode = "code";
          prev = "/";
        }
        out += c;
        i++;
        continue;
      }
    }
  }
  return out;
}

/* ========================================================================================== */
/* Lint                                                                                       */
/* ========================================================================================== */

interface Violation {
  file: string;
  line: number;
  rule: string;
  text: string;
}

export function lintSource(file: string, source: string): Violation[] {
  const scope = scopeOf(file);
  const stripped = stripComments(source);
  const out: Violation[] = [];
  for (const rule of RULES) {
    if (rule.scope !== "all" && rule.scope !== scope) continue;
    if (rule.skip?.test(file)) continue;
    const lines = (rule.raw ? source : stripped).split("\n");
    lines.forEach((text, i) => {
      if (rule.pattern.test(text)) out.push({ file, line: i + 1, rule: rule.id, text: text.trim().slice(0, 140) });
    });
  }
  return out;
}

function format(v: Violation[]): string {
  return v
    .map((x) => `  ${x.file}:${x.line}  [${x.rule}] ${RULES.find((r) => r.id === x.rule)?.why}\n      ${x.text}`)
    .join("\n");
}

describe("copy lint (§11 banned list)", () => {
  const files = targets();

  it("scans apps/*/src and packages/api/src/messages.ts", () => {
    expect(files.some((f) => f.startsWith("apps/web/src/"))).toBe(true);
    expect(files.some((f) => f.startsWith("apps/mobile/src/"))).toBe(true);
    expect(files).toContain("packages/api/src/messages.ts");
  });

  it("no banned copy outside the legacy allowlist", () => {
    const violations = files
      .filter((f) => !ALLOWLIST.includes(f))
      .flatMap((f) => lintSource(f, readFileSync(join(ROOT, f), "utf8")));
    expect(violations, `Banned copy (§11):\n${format(violations)}\n`).toEqual([]);
  });

  it("reports what the legacy allowlist still hides", () => {
    const report: string[] = [];
    for (const f of ALLOWLIST) {
      if (!existsSync(join(ROOT, f))) {
        report.push(`  ${f}: gone, remove it from ALLOWLIST`);
        continue;
      }
      const v = lintSource(f, readFileSync(join(ROOT, f), "utf8"));
      report.push(v.length ? format(v) : `  ${f}: clean now, remove it from ALLOWLIST`);
    }
    if (report.length) console.warn(`copy-lint ALLOWLIST (legacy screens — remove when migrated):\n${report.join("\n")}`);
    expect(new Set(ALLOWLIST).size).toBe(ALLOWLIST.length);
  });
});

describe("copy lint rules catch what they should, and only that", () => {
  const web = (s: string) => lintSource("apps/web/src/x.tsx", s).map((v) => v.rule);
  const mobile = (s: string) => lintSource("apps/mobile/src/x.tsx", s).map((v) => v.rule);
  const staff = (s: string) => lintSource("apps/web/src/app/(staff)/kafe/[slug]/x.tsx", s).map((v) => v.rule);

  it.each([
    ['"Moda\'da bolca penisi var"', "penisi"],
    ['"90 penisini kullan"', "penisi"],
    ["\"peni'yi kullan\"", "peni-apostrophe"],
    ["`peni’n yetmiyor`", "peni-apostrophe"],
    ['"Askın hazır"', "askin"],
    ['"Kasada P-003 de"', "kasada-kod-de"],
    ["`Kasada ${order.code} de`", "kasada-kod-de"],
    ['"₺0 öde"', "tl0-ode"],
    ['"1,5 çay"', "fractional-goods"],
    ['"yarım simit"', "fractional-goods"],
    ['"İhtiyacın varsa al"', "ihtiyac"],
    ['"ihtiyaç sahipleri için"', "ihtiyac"],
    ['"Reddedildi"', "reddedildi"],
    ["<p>Demo: Ayşe</p>", "demo-colon"],
    ['"≈ 3 çay"', "web-glyphs"],
    ['"Kafeler →"', "web-glyphs"],
    ['"Geliyorum ✓"', "web-glyphs"],
    ['"☕ Kahve"', "emoji"],
    ["`${cafe.name}'nde`", "cafe-name-suffix"],
    ["<p>{cafe.name}'den bir mesaj</p>", "cafe-name-suffix"],
  ])("web: %s → %s", (src, rule) => {
    expect(web(src)).toContain(rule);
  });

  it.each([
    ['"Peni\'de bir çay ısmarladım"'], // the app's proper name takes an apostrophe
    ['"90 penin cüzdanına döndü"'],
    ['"55 penini kullan"'],
    ['"peniyi, peniye, peniden"'],
    ['"baskın"'],
    ['"Kasada P-003 kodunu söyle"'],
    ['"Ödeme yok"'],
    ['"Askıda 1.240 çay"'], // tr-TR grouping, not a fraction
    ['"Kafe yetişemedi"'],
    ["// Never write \"Reddedildi\" or ≈ here: comments are fine"],
    ["/* ☕ penisi → */ const a = 1;"],
    ["const url = 'https://wa.me/?text=' // → share"],
    ["`${dativeName(first)} 30 peni ısmarladın`"],
    ["`Sana Peni'de bir çay ısmarladım (${cafe.name}).`"],
    ['"© 2026 Peni"'],
  ])("web: %s is clean", (src) => {
    expect(web(src)).toEqual([]);
  });

  it("mobile may use ≈ and → (its TTFs have them) but not ✓, emoji or textTransform", () => {
    expect(mobile('"≈ 3 çay"')).toEqual([]);
    expect(mobile('"Geliyorum ✓"')).toContain("glyphs");
    expect(mobile("const s = { textTransform: 'uppercase' }")).toContain("textTransform");
    expect(mobile("// no textTransform here")).toContain("textTransform");
    expect(web("const s = { textTransform: 'uppercase' }")).toEqual([]);
  });

  it('"Reddedildi" is allowed on staff surfaces only', () => {
    expect(staff('"Reddedildi"')).toEqual([]);
    expect(web('"Reddedildi"')).toContain("reddedildi");
  });

  it("keeps line numbers when stripping comments", () => {
    const src = 'const a = 1; /* one\ntwo */\n// three\n"Reddedildi"';
    expect(lintSource("apps/web/src/x.ts", src)).toEqual([
      { file: "apps/web/src/x.ts", line: 4, rule: "reddedildi", text: '"Reddedildi"' },
    ]);
  });

  it("handles template literals with nested braces and regex literals", () => {
    // Line 1: the comment after a template with nested braces is still a comment.
    // Line 2: "//" inside a regex literal does not start a comment, so the "→" string is seen.
    const src = "const s = `a ${fn({ b: 1 })} c`; // ≈\nconst r = /\\/\\//; const t = \"→\";";
    expect(lintSource("apps/web/src/x.ts", src).map((v) => [v.line, v.rule])).toEqual([[2, "web-glyphs"]]);
  });
});
