import { afterEach, describe, expect, it } from "vitest";
import { safeEqual, workerAllowed } from "../lib/auth";

describe("secret checks", () => {
  afterEach(() => {
    delete process.env.LEADS_API_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("matches only the exact value", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abd", "abc")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
  });

  it("fails closed when either side is missing", () => {
    expect(safeEqual(null, "abc")).toBe(false);
    expect(safeEqual("abc", undefined)).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });

  it("lets the worker run with the API secret or Vercel Cron's bearer token", () => {
    process.env.LEADS_API_SECRET = "api";
    process.env.CRON_SECRET = "cron";
    expect(workerAllowed(new Headers({ "x-api-secret": "api" }))).toBe(true);
    expect(workerAllowed(new Headers({ authorization: "Bearer cron" }))).toBe(true);
    expect(workerAllowed(new Headers({ authorization: "Bearer api" }))).toBe(false);
    expect(workerAllowed(new Headers())).toBe(false);
  });
});
