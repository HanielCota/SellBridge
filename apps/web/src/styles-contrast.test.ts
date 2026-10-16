import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * Light-mode contrast of the tokens used for small graphics and focus (WCAG 2.2 AA, 1.4.11:
 * 3:1 for interface parts). Read from styles.css so a token edit cannot silently fall below it.
 */
const stylesheet = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

/** The light theme: the `:root` block (the dark one is `.dark`, right after it). */
function lightTokens(): Map<string, string> {
  const start = stylesheet.indexOf("\n:root {");
  const end = stylesheet.indexOf("\n.dark {");
  const block = stylesheet.slice(start, end);
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      tokens.set(name, value.trim());
    }
  }
  return tokens;
}

type Linear = readonly [number, number, number];

function parseOklch(value: string | undefined): Linear {
  const match = value?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (match === null || match === undefined) {
    throw new Error(`token sem oklch(L C H) simples: ${value}`);
  }
  const [lightness, chroma, hue] = [match[1], match[2], match[3]].map(Number);
  return oklchToLinearSrgb(lightness ?? 0, chroma ?? 0, hue ?? 0);
}

const clampChannel = (channel: number) => Math.min(1, Math.max(0, channel));

/** Björn Ottosson's OKLab matrices (https://bottosson.github.io/posts/oklab/). */
function oklchToLinearSrgb(lightness: number, chroma: number, hue: number): Linear {
  const radians = (hue * Math.PI) / 180;
  const greenRed = chroma * Math.cos(radians);
  const blueYellow = chroma * Math.sin(radians);
  const long = (lightness + 0.3963377774 * greenRed + 0.2158037573 * blueYellow) ** 3;
  const medium = (lightness - 0.1055613458 * greenRed - 0.0638541728 * blueYellow) ** 3;
  const short = (lightness - 0.0894841775 * greenRed - 1.291485548 * blueYellow) ** 3;
  return [
    clampChannel(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    clampChannel(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    clampChannel(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
  ];
}

const toGamma = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

/** `color` at `alpha` over `base`, blended like the browser (in sRGB). */
function over(color: Linear, alpha: number, base: Linear): Linear {
  const [red, green, blue] = color.map((channel, index) =>
    toLinear(toGamma(channel) * alpha + toGamma(base[index] ?? 0) * (1 - alpha)),
  );
  return [red ?? 0, green ?? 0, blue ?? 0];
}

function contrast(first: Linear, second: Linear): number {
  const luminance = ([red, green, blue]: Linear) => 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const [light, dark] = [luminance(first), luminance(second)].toSorted(
    (left, right) => right - left,
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const tokens = lightTokens();
const card = parseOklch(tokens.get("card"));
const background = parseOklch(tokens.get("background"));
const INTERFACE_MINIMUM = 3;

describe("light-mode contrast of small graphics", () => {
  it.each(["brand-mark", "finance-gain"])(
    "--%s reaches 3:1 on cards and on the page background",
    (token) => {
      const color = parseOklch(tokens.get(token));
      expect(contrast(color, card)).toBeGreaterThanOrEqual(INTERFACE_MINIMUM);
      expect(contrast(color, background)).toBeGreaterThanOrEqual(INTERFACE_MINIMUM);
    },
  );

  it("--ring reaches 3:1 at the 70% the global focus outline draws it", () => {
    const ring = parseOklch(tokens.get("ring"));
    expect(contrast(over(ring, 0.7, card), card)).toBeGreaterThanOrEqual(INTERFACE_MINIMUM);
    expect(contrast(over(ring, 0.7, background), background)).toBeGreaterThanOrEqual(
      INTERFACE_MINIMUM,
    );
  });

  it("the switch's off track (foreground at 45%) reaches 3:1 on cards", () => {
    const foreground = parseOklch(tokens.get("foreground"));
    expect(contrast(over(foreground, 0.45, card), card)).toBeGreaterThanOrEqual(INTERFACE_MINIMUM);
  });
});
