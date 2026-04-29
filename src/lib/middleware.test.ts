import { describe, it, expect } from "vitest";
import { getRedirectPath } from "./middleware-helpers";

describe("getRedirectPath", () => {
  it("redirects unauthenticated user on any protected path", () => {
    expect(getRedirectPath(null, "/stock")).toBe("/login");
  });
  it("allows linecook to access /stock", () => {
    expect(getRedirectPath({ role: "linecook" }, "/stock")).toBeNull();
  });
  it("redirects linecook from /transfers to /stock", () => {
    expect(getRedirectPath({ role: "linecook" }, "/transfers")).toBe("/stock");
  });
  it("redirects admin from /production to /stock", () => {
    expect(getRedirectPath({ role: "admin" }, "/production")).toBe("/stock");
  });
  it("allows superadmin to access /transfers", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/transfers")).toBeNull();
  });
  it("allows superadmin to access /production", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/production")).toBeNull();
  });
  it("does not redirect /login (public path)", () => {
    expect(getRedirectPath(null, "/login")).toBeNull();
  });
});
