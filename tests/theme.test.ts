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
