import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const catalogs = readdirSync(import.meta.dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    language: entry.name,
    table: JSON.parse(
      readFileSync(new URL(`./${entry.name}/translation.json`, import.meta.url), "utf8"),
    ) as Record<string, unknown>,
  }));

test("catalogs omit the removed research_policy namespace", () => {
  expect(catalogs.length).toBeGreaterThan(0);
  for (const { language, table } of catalogs) {
    expect(Object.hasOwn(table, "research_policy"), language).toBe(false);
  }
});

test("catalog values omit the removed withdrawal control and route", () => {
  expect(catalogs.length).toBeGreaterThan(0);
  for (const { language, table } of catalogs) {
    const pending: unknown[] = [table];
    while (pending.length > 0) {
      const value = pending.pop();
      if (typeof value === "string") {
        expect(value, language).not.toContain("Withdraw from study");
        expect(value, language).not.toContain("/withdrawal");
      } else if (value !== null && typeof value === "object") {
        pending.push(...Object.values(value));
      }
    }
  }
});
