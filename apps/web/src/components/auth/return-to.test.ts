import { describe, expect, it } from "vitest";
import { safeReturnTo, signInHref } from "./return-to";

describe("safeReturnTo", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/k/moda?ekle=latte")).toBe("/k/moda?ekle=latte");
    expect(safeReturnTo("/hediye/g_1#kabul")).toBe("/hediye/g_1#kabul");
    expect(safeReturnTo("/k/moda?sepet=1&ekle=latte")).toBe("/k/moda?sepet=1&ekle=latte");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "/\n/evil.example",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });

  it("never loops back to the sign-in page", () => {
    expect(safeReturnTo("/giris")).toBeNull();
    expect(safeReturnTo("/giris?returnTo=/")).toBeNull();
  });

  it("builds the sign-in link", () => {
    expect(signInHref("/hediye/g_1")).toBe("/giris?returnTo=%2Fhediye%2Fg_1");
  });
});
