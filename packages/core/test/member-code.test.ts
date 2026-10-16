import { describe, expect, it } from "vitest";
import { MEMBER_CODE_ALPHABET, memberCode, normalizeMemberCode } from "../src";

describe("Peni kodu", () => {
  it("is a stable, short code in the 'M7K-42Q' shape", () => {
    const code = memberCode("mem_6f1c2a90-1b2c-4d3e-8f00-112233445566");
    expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    expect(memberCode("mem_6f1c2a90-1b2c-4d3e-8f00-112233445566")).toBe(code);
  });

  it("uses no look-alikes and no vowels", () => {
    for (const ch of "01OILUAEİÖÜ") expect(MEMBER_CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 500; i++) {
      for (const ch of memberCode(`mem_${i}`).replace("-", "")) expect(MEMBER_CODE_ALPHABET).toContain(ch);
    }
  });

  it("spreads well: 20 000 memberships, no collisions", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(memberCode(`mem_${i}`));
    expect(seen.size).toBe(20_000);
  });

  it("gives another code for the same id on a retry", () => {
    expect(memberCode("mem_x", 1)).not.toBe(memberCode("mem_x", 0));
  });

  it("normalises what the till typed", () => {
    const code = memberCode("mem_42");
    expect(normalizeMemberCode(code.toLowerCase().replace("-", " "))).toBe(code);
    expect(normalizeMemberCode(code.replace("-", ""))).toBe(code);
    expect(normalizeMemberCode("M0K-42Q")).toBeNull(); // 0 is never used
    expect(normalizeMemberCode("M7K-42")).toBeNull();
  });
});
