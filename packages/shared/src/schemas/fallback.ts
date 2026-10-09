import type { z } from "zod";

/**
 * URL search params are user-controlled: an invalid value falls back instead of failing the route.
 * Zod's `.catch()` is not a Promise, so the promise lint rule is overridden for this file only.
 */
export function withFallback<TSchema extends z.ZodType>(
  schema: TSchema,
  fallback: z.output<TSchema>,
): z.ZodCatch<TSchema> {
  return schema.catch(fallback);
}

/** Optional search param: missing or invalid values become `undefined`. */
export function optionalParameter<TSchema extends z.ZodType>(
  schema: TSchema,
): z.ZodCatch<z.ZodOptional<TSchema>> {
  return schema.optional().catch(undefined);
}
