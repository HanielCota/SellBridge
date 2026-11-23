import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { THEME_COLORS, themeInitScript } from "./theme-provider";

interface FirstPaint {
  dark: boolean;
  themeColor: string | null;
}

/** Runs the head script against a fake page: what was saved, and what the phone is set to. */
function runInitScript(saved: string | null, systemPrefersDark: boolean): FirstPaint {
  const paint: FirstPaint = { dark: true, themeColor: null };
  const localStorage = { getItem: () => saved };
  const matchMedia = (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && systemPrefersDark,
  });
  const document = {
    documentElement: {
      classList: {
        toggle: (_name: string, on: boolean) => {
          paint.dark = on;
        },
      },
    },
    querySelector: () => ({
      setAttribute: (_name: string, value: string) => {
        paint.themeColor = value;
      },
    }),
  };
  runInNewContext(themeInitScript, { localStorage, matchMedia, document });
  return paint;
}

describe("themeInitScript", () => {
  test("opens light on a first visit from a phone set to light", () => {
    expect(runInitScript(null, false)).toEqual({ dark: false, themeColor: THEME_COLORS.light });
  });

  test("opens dark on a first visit from a phone set to dark", () => {
    expect(runInitScript(null, true)).toEqual({ dark: true, themeColor: THEME_COLORS.dark });
  });

  test("keeps the saved choice over the phone's setting", () => {
    expect(runInitScript("dark", false).dark).toBe(true);
    expect(runInitScript("light", true).dark).toBe(false);
  });
});
