import { describe, expect, it } from "vitest";
import { findElseKeywords, stripNonCode } from "./no-else-scanner.ts";

describe("findElseKeywords", () => {
  it("detects an else keyword in code", () => {
    const source = "if (a) {\n  run();\n} else {\n  stop();\n}";
    expect(findElseKeywords(source)).toEqual([{ line: 3, column: 3 }]);
  });

  it("detects else if", () => {
    expect(findElseKeywords("if (a) {} else if (b) {}")).toHaveLength(1);
  });

  it("ignores else inside line and block comments", () => {
    const source = "// else here\n/* and else\n there */ const a = 1;";
    expect(findElseKeywords(source)).toEqual([]);
  });

  it("ignores else inside strings and template literals", () => {
    const source = "const a = 'else'; const b = \"else\"; const c = `x else ${'else'} y`;";
    expect(findElseKeywords(source)).toEqual([]);
  });

  it("detects else inside template interpolation code", () => {
    const source = "const c = `${(() => { if (a) { return 1 } else { return 2 } })()}`;";
    expect(findElseKeywords(source)).toHaveLength(1);
  });

  it("does not match identifiers containing else", () => {
    expect(findElseKeywords("const elsewhere = orElse(1);")).toEqual([]);
  });

  it("keeps line numbers stable when blanking multi-line content", () => {
    const stripped = stripNonCode("/* a\nb */\nx");
    expect(stripped.split("\n")).toHaveLength(3);
  });
});
