import { describe, expect, it } from "vitest";
import { config } from "./proxy";

function isMatched(path: string): boolean {
  return config.matcher.some((matcher) =>
    new RegExp(`^${matcher}$`).test(path),
  );
}

describe("proxy matcher", () => {
  it("protects the automation dojo", () => {
    expect(isMatched("/dojo")).toBe(true);
    expect(isMatched("/dojo/anything")).toBe(true);
  });

  it("does not intercept Next.js static assets", () => {
    expect(isMatched("/_next/static/chunks/app.js")).toBe(false);
  });
});
