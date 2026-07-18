import { describe, it, expect } from "vitest";
import { hasMinRole, ROLE_ORDER } from "./roles";

describe("hasMinRole", () => {
  it("staff satisfies staff", () => {
    expect(hasMinRole("staff", "staff")).toBe(true);
  });
  it("staff does not satisfy admin", () => {
    expect(hasMinRole("staff", "admin")).toBe(false);
  });
  it("admin satisfies staff", () => {
    expect(hasMinRole("admin", "staff")).toBe(true);
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
