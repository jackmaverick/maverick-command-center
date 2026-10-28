import { describe, expect, it } from "vitest";
import { getSafeServerError } from "./server-error";

describe("safe server error logging", () => {
  it("keeps the message and PostgreSQL code", () => {
    const error = Object.assign(new Error("relation does not exist"), {
      code: "42P01",
    });
    expect(getSafeServerError(error)).toEqual({
      message: "relation does not exist",
      code: "42P01",
    });
  });

  it("redacts database URLs and secret-like values", () => {
    const error = new Error(
      "connect postgresql://user:password@host/db password=hunter2"
    );
    expect(getSafeServerError(error).message).toBe(
      "connect [redacted-database-url] password=[redacted]"
    );
  });
});
