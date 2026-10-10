export interface DeviceDescription {
  browser: string;
  os: string;
  isMobile: boolean;
}

/** Order matters: Edge and Opera also announce Chrome, Chrome also announces Safari. */
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

/** Android announces Linux and iPadOS can announce Mac OS X, so they come first. */
const SYSTEMS: readonly [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function firstMatch(userAgent: string, table: readonly [RegExp, string][]): string | null {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** "Chrome no Windows", good enough to recognize your own devices in the session list. */
export function describeUserAgent(userAgent: string | null | undefined): DeviceDescription {
  const value = userAgent ?? "";
  return {
    browser: firstMatch(value, BROWSERS) ?? "Navegador desconhecido",
    os: firstMatch(value, SYSTEMS) ?? "sistema desconhecido",
    isMobile: /Mobi|Android|iPhone|iPad|iPod/.test(value),
  };
}
