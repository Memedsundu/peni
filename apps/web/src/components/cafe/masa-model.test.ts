import type { PostDTO } from "@peni/api";
import { describe, expect, it } from "vitest";
import {
  eventBody,
  eventIsFull,
  eventIsPast,
  eventTopic,
  feedOrder,
  newestFirst,
  postUrl,
  toggledHeart,
  toggledRsvp,
  whenLabel,
  withOverlay,
  eventIcs,
  icsFilename,
  masaMoreCopy,
} from "./masa-model";

const post = (over: Partial<PostDTO> = {}): PostDTO => ({
  id: "p",
  kind: "post",
  body: "Gövde",
  publishedAt: "2026-10-16T09:00:00.000Z",
  pinned: false,
  eventStartsAt: null,
  eventCapacity: null,
  reactionCount: 0,
  commentCount: 0,
  rsvpCount: 0,
  reactedByMe: false,
  rsvpedByMe: false,
  comments: [],
  title: null,
  attendees: [],
  answeredTodayByMe: false,
  ...over,
});

describe("feedOrder", () => {
  it("puts pinned items on top, then newest first", () => {
    const a = post({ id: "a", publishedAt: "2026-10-10T09:00:00Z" });
    const b = post({ id: "b", publishedAt: "2026-10-15T09:00:00Z" });
    const c = post({ id: "c", publishedAt: "2026-10-01T09:00:00Z", pinned: true });
    expect(feedOrder([a, b, c]).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });
  it("keeps the given order on ties and never mutates", () => {
    const list = [post({ id: "x" }), post({ id: "y" })];
    expect(feedOrder(list).map((p) => p.id)).toEqual(["x", "y"]);
    expect(list.map((p) => p.id)).toEqual(["x", "y"]);
  });
});

describe("event topic and body", () => {
  it("uses the title when there is one [G4]", () => {
    const p = { title: "Takas kütüphanesi", body: "Kitabını getir." };
    expect(eventTopic(p)).toBe("Takas kütüphanesi");
    expect(eventBody(p)).toBe("Kitabını getir.");
  });
  it("falls back to the first line and never repeats it", () => {
    const p = { title: null, body: "Takas kütüphanesi\nKitabını getir." };
    expect(eventTopic(p)).toBe("Takas kütüphanesi");
    expect(eventBody(p)).toBe("Kitabını getir.");
    expect(eventBody({ title: "  ", body: "Tek satır" })).toBe("");
  });
});

describe("event phase", () => {
  const now = new Date("2026-10-16T17:00:00Z");
  it("is past only once its two hours are over", () => {
    expect(eventIsPast({ eventStartsAt: "2026-10-16T16:00:00Z" }, now)).toBe(false);
    expect(eventIsPast({ eventStartsAt: "2026-10-16T15:00:00Z" }, now)).toBe(true);
    expect(eventIsPast({ eventStartsAt: null }, now)).toBe(false);
  });
  it("is full at capacity; no capacity never fills", () => {
    expect(eventIsFull({ eventCapacity: 14, rsvpCount: 14 })).toBe(true);
    expect(eventIsFull({ eventCapacity: 14, rsvpCount: 13 })).toBe(false);
    expect(eventIsFull({ eventCapacity: null, rsvpCount: 40 })).toBe(false);
  });
});

describe("answers", () => {
  it("sorts newest first", () => {
    const c = (id: string, at: string) => ({ id, authorName: "Ayşe Y.", body: "…", createdAt: at });
    expect(newestFirst([c("1", "2026-10-16T06:00:00Z"), c("2", "2026-10-16T08:00:00Z")]).map((x) => x.id)).toEqual(["2", "1"]);
  });
  it("says the time today and the day otherwise (Istanbul)", () => {
    const now = new Date("2026-10-16T12:00:00Z");
    expect(whenLabel("2026-10-16T06:12:00Z", now)).toBe("09:12");
    expect(whenLabel("2026-10-15T06:12:00Z", now)).toBe("dün");
  });
});

describe("optimistic toggles", () => {
  it("hearts and seats flip and count by one", () => {
    expect(toggledHeart({ reactedByMe: false, reactionCount: 3 })).toEqual({ reactedByMe: true, reactionCount: 4 });
    expect(toggledHeart({ reactedByMe: true, reactionCount: 0 })).toEqual({ reactedByMe: false, reactionCount: 0 });
    expect(toggledRsvp({ rsvpedByMe: true, rsvpCount: 7 })).toEqual({ rsvpedByMe: false, rsvpCount: 6 });
  });
  it("an overlay holds until the server moves, then the server wins", () => {
    const base = { reactedByMe: false, reactionCount: 3 };
    const overlay = { base, value: toggledHeart(base) };
    expect(withOverlay(base, overlay)).toEqual({ reactedByMe: true, reactionCount: 4 });
    expect(withOverlay({ reactedByMe: true, reactionCount: 5 }, overlay)).toEqual({ reactedByMe: true, reactionCount: 5 });
    expect(withOverlay(base, null)).toBe(base);
  });
});

it("links to the card on the café page", () => {
  expect(postUrl("https://peni.app/", "moda", "post_1")).toBe("https://peni.app/k/moda#post-post_1");
});

describe("Takvime ekle without the server", () => {
  const cafe = { name: "Moda Kahvesi", address: "Moda Cd. No: 42", district: "Kadıköy", city: "İstanbul" };
  const event = post({
    id: "post_event_1",
    kind: "event",
    title: "Takas kütüphanesi",
    body: "Bir kitap getir, bir kitap al.",
    eventStartsAt: "2026-10-22T16:00:00.000Z",
  });

  it("names the file after the day in Istanbul", () => {
    expect(icsFilename("2026-10-22T16:00:00.000Z")).toBe("peni-masasi-2026-10-22.ics");
    // 01:30 in Istanbul is still the evening before in UTC.
    expect(icsFilename("2026-10-22T22:30:00.000Z")).toBe("peni-masasi-2026-10-23.ics");
  });

  it("is two hours from eventStartsAt, with the topic and the café's address", () => {
    const file = eventIcs(event, cafe, new Date("2026-10-16T12:00:00Z"))!;
    expect(file.filename).toBe("peni-masasi-2026-10-22.ics");
    const lines = file.body.replace(/\r\n /g, "").split("\r\n");
    expect(lines).toContain("DTSTART:20261022T160000Z");
    expect(lines).toContain("DTEND:20261022T180000Z");
    expect(lines).toContain("SUMMARY:Takas kütüphanesi");
    expect(lines).toContain("LOCATION:Moda Kahvesi\\, Moda Cd. No: 42\\, Kadıköy\\, İstanbul");
    expect(lines).toContain("DESCRIPTION:Bir kitap getir\\, bir kitap al.");
  });

  it("is nothing for a post that isn't an event", () => {
    expect(eventIcs(post(), cafe, new Date())).toBeNull();
  });
});

it("says how full a table was, and how many are coming to an open one", () => {
  expect(masaMoreCopy.seatsPast(9, 12)).toBe("9/12 yer doluydu");
  expect(masaMoreCopy.came(8)).toBe("8 kişi geldi");
  expect(masaMoreCopy.attending(8)).toBe("8 kişi geliyor");
  expect(masaMoreCopy.attending(8, true)).toBe("8 kişi geliyor · sen de geliyorsun");
});
