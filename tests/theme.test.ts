import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, themeColors, appearances } from "../src/lib/theme";

test("migrates all six saved themes without changing their appearance", () => {
  for (const [theme, color, appearance] of [
    ["orange", "orange", "light"],
    ["purple", "purple", "dark"],
    ["blue", "blue", "light"],
    ["green", "green", "light"],
    ["white", "neutral", "light"],
    ["dark", "neutral", "dark"],
  ])
    assert.deepEqual(resolveTheme({ theme }), { color, appearance });
});
test("retains every independent color and appearance combination", () => {
  for (const color of themeColors)
    for (const appearance of appearances)
      assert.deepEqual(resolveTheme({ color, appearance, theme: "dark" }), {
        color,
        appearance,
      });
});
test("invalid or missing theme data falls back safely", () => {
  for (const value of [
    undefined,
    null,
    42,
    {},
    { theme: "invalid" },
    { color: "invalid" },
  ])
    assert.deepEqual(resolveTheme(value), {
      color: "orange",
      appearance: "light",
    });
  assert.deepEqual(resolveTheme({ color: "blue", appearance: "invalid" }), {
    color: "blue",
    appearance: "light",
  });
});

test("dark canvases share neutral semantic surfaces while retaining distinct accents", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/styles/globals.css", "utf8");
  const foundation = css.match(/\[data-appearance="dark"\] \{([^}]+)\}/)![1];
  for (const key of ["bg", "surface", "surface-alt", "soft", "line"]) {
    const value = foundation.match(new RegExp(`--${key}: #([a-f0-9]{6})`))![1];
    assert.equal(value.slice(0, 2), value.slice(2, 4));
    assert.equal(value.slice(2, 4), value.slice(4, 6));
  }
  for (const color of themeColors) {
    const body = css.match(
      new RegExp(
        `\\[data-color="${color}"\\]\\[data-appearance="dark"\\] \\{([^}]+)\\}`,
      ),
    )![1];
    assert.doesNotMatch(body, /--(?:bg|surface|surface-alt|soft|line):/);
  }
  assert.match(css, /--accent: #c7b0f4/);
  assert.match(css, /--accent: #f0a17b/);
});
