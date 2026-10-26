/**
 * Builders for the tools' output schemas.
 *
 * The SDK validates every non-error tool result against its outputSchema and turns a mismatch
 * into an isError result, so a schema stricter than what the Control Center really sends breaks
 * a working tool. These builders make the safe shape the only easy one: objects never close
 * (`additionalProperties` is never set), and there is no helper for `enum` or `format`. Codes
 * and labels are plain integers and strings, with their meanings in `description`.
 *
 * Keywords are limited to those draft-07 and 2020-12 share (type, properties, required, items,
 * description), and there is no $ref: clients resolve references inconsistently.
 */
export type JsonSchema = Record<string, unknown>;

function typed(type: string, description?: string): JsonSchema {
  return description === undefined ? { type } : { type, description };
}

export const str = (description?: string): JsonSchema => typed("string", description);
export const int = (description?: string): JsonSchema => typed("integer", description);
export const num = (description?: string): JsonSchema => typed("number", description);
export const bool = (description?: string): JsonSchema => typed("boolean", description);
/** Dates are plain strings: query-string dates come back without an offset, which `format: date-time` rejects. */
export const date = (description?: string): JsonSchema => typed("string", description);
/** Any JSON value. Used only where the content is caller-defined (start_agent sync data). */
export const anyValue = (description: string): JsonSchema => ({ description });

export function nullable(schema: JsonSchema): JsonSchema {
  if (typeof schema.type !== "string") {
    throw new Error("nullable() needs a schema with a single type");
  }
  return { ...schema, type: [schema.type, "null"] };
}

export function obj(
  properties: Record<string, JsonSchema>,
  opts: { optional?: readonly string[]; description?: string } = {}
): JsonSchema {
  const optional = new Set(opts.optional ?? []);
  for (const key of optional) {
    if (!(key in properties)) throw new Error(`obj(): optional key "${key}" is not a property`);
  }
  const schema: JsonSchema = {
    type: "object",
    properties,
    required: Object.keys(properties).filter((key) => !optional.has(key)),
  };
  if (opts.description !== undefined) schema.description = opts.description;
  return schema;
}

export function arrayOf(items: JsonSchema, description?: string): JsonSchema {
  return description === undefined ? { type: "array", items } : { type: "array", items, description };
}
