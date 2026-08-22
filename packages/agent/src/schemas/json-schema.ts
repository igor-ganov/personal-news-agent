import { z } from "zod";

/**
 * Tool input schemas for the Claude API.
 *
 * Two rules keep strict tool use working reliably:
 *  - every object is a `strictObject`, so `additionalProperties: false` is emitted;
 *  - no field is optional or nullable, so no union types appear in the schema.
 *    "Unknown" is expressed as an empty string and mapped to `null` in the domain.
 */
export const toolInputSchema = (schema: z.ZodType): Record<string, unknown> =>
  z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
