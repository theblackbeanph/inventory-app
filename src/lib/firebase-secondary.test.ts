import { describe, it, expect } from "vitest";
import { getSecondaryAuth } from "./firebase-secondary";

describe("getSecondaryAuth", () => {
  it("returns an Auth instance", () => {
    const auth = getSecondaryAuth();
    expect(auth).toBeDefined();
    expect(auth.app.name).toBe("user-creator");
  });

  it("returns the same instance on repeated calls (no duplicate app)", () => {
    const a = getSecondaryAuth();
    const b = getSecondaryAuth();
    expect(a.app).toBe(b.app);
  });
});
