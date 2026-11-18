import { describe, expect, it } from "vitest";
import { requestId } from "./requestId";
describe("LAN request IDs", () => {
  it("uses getRandomValues without requiring secure-context randomUUID", () => {
    const ids = new Set(Array.from({ length: 100 }, () => requestId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{32}$/);
  });
});
