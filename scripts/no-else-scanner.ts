/**
 * Minimal lexer that blanks out comments, string literals and template literal text,
 * so a plain-word search for `else` only matches real code tokens.
 */

type ScannerState = "code" | "lineComment" | "blockComment" | "single" | "double" | "template";

const QUOTE_STATES: Record<string, ScannerState> = {
  "'": "single",
  '"': "double",
  "`": "template",
};

export function stripNonCode(source: string): string {
  let state: ScannerState = "code";
  const templateDepth: number[] = [];
  let braceDepth = 0;
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    const next = source.charAt(index + 1);
    const result = step({ state, character, next, braceDepth, templateDepth });
    state = result.state;
    braceDepth = result.braceDepth;
    output += result.emit;
    index += result.skip;
  }

  return output;
}

interface StepInput {
  state: ScannerState;
  character: string;
  next: string;
  braceDepth: number;
  templateDepth: number[];
}

interface StepResult {
  state: ScannerState;
  braceDepth: number;
  emit: string;
  skip: number;
}

function blank(character: string): string {
  return character === "\n" ? "\n" : " ";
}

function stepLineComment({ character, braceDepth }: StepInput): StepResult {
  return {
    state: character === "\n" ? "code" : "lineComment",
    braceDepth,
    emit: blank(character),
    skip: 0,
  };
}

function stepBlockComment({ character, next, braceDepth }: StepInput): StepResult {
  if (character === "*" && next === "/") {
    return { state: "code", braceDepth, emit: "  ", skip: 1 };
  }
  return { state: "blockComment", braceDepth, emit: blank(character), skip: 0 };
}

const STEP_HANDLERS: Record<ScannerState, (input: StepInput) => StepResult> = {
  code: stepCode,
  lineComment: stepLineComment,
  blockComment: stepBlockComment,
  single: (input) => stepQuoted(input, "'"),
  double: (input) => stepQuoted(input, '"'),
  template: stepTemplate,
};

function step(input: StepInput): StepResult {
  return STEP_HANDLERS[input.state](input);
}

function stepCode(input: StepInput): StepResult {
  const { character, next, braceDepth, templateDepth } = input;
  if (character === "/" && next === "/") {
    return { state: "lineComment", braceDepth, emit: "  ", skip: 1 };
  }
  if (character === "/" && next === "*") {
    return { state: "blockComment", braceDepth, emit: "  ", skip: 1 };
  }
  const quoteState = QUOTE_STATES[character];
  if (quoteState) {
    return { state: quoteState, braceDepth, emit: " ", skip: 0 };
  }
  if (character === "{") {
    return { state: "code", braceDepth: braceDepth + 1, emit: character, skip: 0 };
  }
  if (character !== "}") {
    return { state: "code", braceDepth, emit: character, skip: 0 };
  }
  const resumesTemplate = templateDepth.at(-1) === braceDepth;
  if (resumesTemplate) {
    templateDepth.pop();
    return { state: "template", braceDepth: braceDepth - 1, emit: " ", skip: 0 };
  }
  return { state: "code", braceDepth: braceDepth - 1, emit: character, skip: 0 };
}

function stepQuoted(input: StepInput, quote: string): StepResult {
  const { state, character, braceDepth } = input;
  if (character === "\\") {
    return { state, braceDepth, emit: "  ", skip: 1 };
  }
  if (character === quote) {
    return { state: "code", braceDepth, emit: " ", skip: 0 };
  }
  return { state, braceDepth, emit: blank(character), skip: 0 };
}

function stepTemplate(input: StepInput): StepResult {
  const { state, character, next, braceDepth, templateDepth } = input;
  if (character === "\\") {
    return { state, braceDepth, emit: "  ", skip: 1 };
  }
  if (character === "`") {
    return { state: "code", braceDepth, emit: " ", skip: 0 };
  }
  if (character === "$" && next === "{") {
    const depth = braceDepth + 1;
    templateDepth.push(depth);
    return { state: "code", braceDepth: depth, emit: "  ", skip: 1 };
  }
  return { state, braceDepth, emit: blank(character), skip: 0 };
}

export interface ElseViolation {
  line: number;
  column: number;
}

export function findElseKeywords(source: string): ElseViolation[] {
  const lines = stripNonCode(source).split("\n");
  return lines.flatMap((lineText, lineIndex) =>
    Array.from(lineText.matchAll(/\belse\b/g), (match) => ({
      line: lineIndex + 1,
      column: match.index + 1,
    })),
  );
}
