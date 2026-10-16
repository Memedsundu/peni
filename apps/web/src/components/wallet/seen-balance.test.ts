import { describe, expect, it } from "vitest";
import { parseSeen, serializeSeen } from "./seen-balance";

describe("peni_seen cookie", () => {
  it("round-trips the balances per café", () => {
    const seen = { moda: 442, kuzguncuk: 27 };
    expect(serializeSeen(seen)).toBe("moda:442|kuzguncuk:27");
    expect(parseSeen(serializeSeen(seen))).toEqual(seen);
  });

  it("keeps whole, non-negative peni only", () => {
    expect(serializeSeen({ moda: 12.9, kuzguncuk: -4 })).toBe("moda:12|kuzguncuk:0");
  });

  it("skips anything malformed instead of failing", () => {
    expect(parseSeen(undefined)).toEqual({});
    expect(parseSeen("")).toEqual({});
    expect(parseSeen("moda|:4|kuzguncuk:abc|x:-1|ok:7")).toEqual({ ok: 7 });
    expect(parseSeen("%E0%A4%A:5|moda:3")).toEqual({ moda: 3 });
  });

  it("encodes a slug that could break the format", () => {
    const seen = { "a|b:c": 5 };
    expect(serializeSeen(seen)).toBe("a%7Cb%3Ac:5");
    expect(parseSeen(serializeSeen(seen))).toEqual(seen);
  });
});
