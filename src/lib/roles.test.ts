import { describe, it, expect } from "vitest";
import { hasMinRole, ROLE_ORDER } from "./roles";

describe("hasMinRole", () => {
  it("linecook satisfies linecook", () => {
    expect(hasMinRole("linecook", "linecook")).toBe(true);
  });
  it("linecook does not satisfy admin", () => {
    expect(hasMinRole("linecook", "admin")).toBe(false);
  });
  it("admin satisfies linecook", () => {
    expect(hasMinRole("admin", "linecook")).toBe(true);
  });
  it("admin satisfies admin", () => {
    expect(hasMinRole("admin", "admin")).toBe(true);
  });
  it("admin does not satisfy superadmin", () => {
    expect(hasMinRole("admin", "superadmin")).toBe(false);
  });
  it("superadmin satisfies all roles", () => {
    for (const role of ROLE_ORDER) {
      expect(hasMinRole("superadmin", role)).toBe(true);
    }
  });
});
