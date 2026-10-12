import { z } from "zod";

/** Diagnostics never include request bodies, cookies, search parameters or concrete route IDs. */
export function redactDiagnostic(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /\b(?:password|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*\S+/gi,
      "[credential]",
    )
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[credential]")
    .replace(/(["'`])[^\n]*?\1/g, "[quoted]")
    .slice(0, 1000);
}

/** Keep code locations, never the message line or arbitrary contents of a stack. */
export function diagnosticFrames(stack: string): string[] {
  return [...stack.matchAll(/(?:\/assets\/|\/src\/)([\w./-]+\.(?:[cm]?js|tsx?)):\d+:\d+/g)]
    .slice(0, 12)
    .map(([frame]) => frame.slice(0, 250));
}

export function describeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", message: "Non-Error value thrown", frames: [] };
  }
  return {
    name: /^[A-Za-z]*Error$/.test(error.name) ? error.name : "Error",
    message: redactDiagnostic(error.message),
    frames: diagnosticFrames(error.stack ?? ""),
  };
}

export const errorReportSchema = z
  .object({
    id: z.uuid(),
    occurredAt: z.iso.datetime(),
    buildId: z.string().regex(/^[\w.-]{1,100}$/),
    route: z
      .string()
      .regex(/^\/[\w/$.-]*$/)
      .max(200),
    name: z
      .string()
      .regex(/^[A-Za-z]*Error$/)
      .max(60),
    message: z.string().max(1000),
    frames: z
      .array(
        z
          .string()
          .regex(/^\/(assets|src)\/[\w./-]+\.(?:[cm]?js|tsx?):\d+:\d+$/)
          .max(250),
      )
      .max(12),
  })
  .strict();

export type ErrorReport = z.infer<typeof errorReportSchema>;
