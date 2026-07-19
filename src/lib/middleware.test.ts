import { describe, it, expect } from "vitest";
import { getRedirectPath } from "./middleware-helpers";

describe("getRedirectPath", () => {
  it("redirects unauthenticated user on any protected path", () => {
    expect(getRedirectPath(null, "/stock")).toBe("/login");
  });
  it("allows staff to access /stock", () => {
    expect(getRedirectPath({ role: "staff" }, "/stock")).toBeNull();
  });
  it("allows staff to access /transfers", () => {
    expect(getRedirectPath({ role: "staff" }, "/transfers")).toBeNull();
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
  it("allows admin to access /sales", () => {
    expect(getRedirectPath({ role: "admin" }, "/sales")).toBeNull();
  });
  it("redirects staff from /sales to /stock", () => {
    expect(getRedirectPath({ role: "staff" }, "/sales")).toBe("/stock");
  });
  it("allows superadmin to access /sales", () => {
    expect(getRedirectPath({ role: "superadmin" }, "/sales")).toBeNull();
  });
});
