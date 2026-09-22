import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { themeColors, appearances } from "../src/lib/theme";

const css = readFileSync("src/styles/globals.css", "utf8").split("* {")[0];
const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  ([, selector, body]) => ({
    selector: selector.trim(),
    tokens: Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*(#[\da-f]+)/g)].map(([, key, value]) => [
        key,
        value,
      ]),
    ),
  }),
);
function luminance(hex: string) {
  let rgb = hex.slice(1);
  if (rgb.length === 3) rgb = [...rgb].map((c) => c + c).join("");
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const v = parseInt(rgb.slice(index * 2, index * 2 + 2), 16) / 255;
    return (
      sum + weight * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    );
  }, 0);
}
for (const color of themeColors)
  for (const appearance of appearances) {
    test(`${color} ${appearance} semantic text pairs meet WCAG AA`, () => {
      const tokens: Record<string, string> = {};
      for (const { selector, tokens: values } of blocks) {
        if (
          selector.includes(":root") ||
          (selector.includes(`data-color="${color}"`) &&
            selector.includes(`data-appearance="${appearance}"`)) ||
          (appearance === "dark" && selector === '[data-appearance="dark"]')
        )
          Object.assign(tokens, values);
      }
      const pairs = [
        ...["text", "muted"].flatMap((fg) =>
          ["bg", "surface", "surface-alt", "soft"].map((bg) => [fg, bg]),
        ),
        ...["accent", "success", "warning", "danger"].map((fg) => [
          fg,
          `${fg}-soft`,
        ]),
        ["on-accent", "accent"],
        ["on-accent", "accent-hover"],
      ];
      for (const [fg, bg] of pairs) {
        const a = luminance(tokens[fg]),
          b = luminance(tokens[bg]);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        assert.ok(ratio >= 4.5, `${fg} on ${bg}: ${ratio.toFixed(2)}:1`);
      }
    });
  }
