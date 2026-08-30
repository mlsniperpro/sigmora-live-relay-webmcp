import {
  LIVE_RELAY_TOOL_NAMES,
  type LiveRelayToolInputMap,
  type LiveRelayToolName,
} from "./contracts.js";

export type JsonSchemaPrimitive = string | number | boolean | null;

/** JSON Schema subset used by the package. Values remain plain JSON and are safe to export. */
export interface JsonSchema {
  readonly $schema?: string;
  readonly type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  readonly title?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
  readonly enum?: readonly JsonSchemaPrimitive[];
  readonly const?: JsonSchemaPrimitive;
  readonly oneOf?: readonly JsonSchema[];
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minProperties?: number;
  readonly format?: "uri";
}

export interface LiveRelayToolAnnotations {
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
}

export interface LiveRelayToolDefinition<Name extends LiveRelayToolName = LiveRelayToolName> {
  readonly name: Name;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** Documentation schema. The current imperative WebMCP draft registers input schemas only. */
  readonly outputSchema: JsonSchema;
  readonly annotations: LiveRelayToolAnnotations;
}

const idSchema = (description: string): JsonSchema => ({
  type: "string",
  description,
  minLength: 1,
  maxLength: 128,
});

const destinationIdsSchema: JsonSchema = {
  type: "array",
  description: "Exact connected destination/account identifiers shown on the current board.",
  items: idSchema("A destination identifier returned by get_live_relay_context."),
  minItems: 1,
  maxItems: 9,
  uniqueItems: true,
};

const queueItemIdsSchema: JsonSchema = {
  type: "array",
  description: "Exact review queue item identifiers covered by the visible approval.",
  items: idSchema("A queue item identifier returned by queue_live_relay."),
  minItems: 1,
  maxItems: 9,
  uniqueItems: true,
};

const emptyInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

const findActiveLiveInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    mode: {
      type: "string",
      enum: ["discover_youtube", "use_declared"],
      description: "Discover an authenticated YouTube broadcast or use a creator-declared fallback.",
    },
    declaration: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["youtube", "tiktok"] },
        title: { type: "string", minLength: 1, maxLength: 200 },
        url: { type: "string", format: "uri", minLength: 1, maxLength: 2048 },
      },
      required: ["platform", "title", "url"],
      additionalProperties: false,
    },
  },
  required: ["mode"],
  additionalProperties: false,
  oneOf: [
    {
      type: "object",
      properties: { mode: { const: "discover_youtube" } },
      required: ["mode"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        mode: { const: "use_declared" },
        declaration: {
          type: "object",
          properties: {
            platform: { type: "string", enum: ["youtube", "tiktok"] },
            title: { type: "string", minLength: 1, maxLength: 200 },
            url: { type: "string", format: "uri", minLength: 1, maxLength: 2048 },
          },
          required: ["platform", "title", "url"],
          additionalProperties: false,
        },
      },
      required: ["mode", "declaration"],
      additionalProperties: false,
    },
  ],
};

const relayBriefSchema: JsonSchema = {
  type: "object",
  properties: {
    tone: {
      type: "string",
      enum: ["high_energy", "warm", "urgent", "informative"],
    },
    cta: { type: "string", minLength: 1, maxLength: 120 },
    durationSeconds: { type: "integer", const: 12 },
    aspectRatio: { type: "string", const: "9:16" },
  },
  required: ["tone", "cta", "durationSeconds", "aspectRatio"],
  additionalProperties: false,
};

const draftInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    liveEventId: idSchema("The verified or creator-declared event identifier."),
    destinationIds: destinationIdsSchema,
    brief: relayBriefSchema,
  },
  required: ["liveEventId", "destinationIds", "brief"],
  additionalProperties: false,
};

const getRelayInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: { relayId: idSchema("The relay identifier returned by draft_live_relay.") },
  required: ["relayId"],
  additionalProperties: false,
};

const revisionChangesSchema: JsonSchema = {
  type: "object",
  properties: {
    cta: { type: "string", minLength: 1, maxLength: 120 },
    tone: {
      type: "string",
      enum: ["high_energy", "warm", "urgent", "informative"],
    },
    captions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          destinationId: idSchema("The exact destination whose caption is changing."),
          caption: { type: "string", minLength: 1, maxLength: 2200 },
        },
        required: ["destinationId", "caption"],
        additionalProperties: false,
      },
      minItems: 1,
      maxItems: 9,
    },
    destinationIds: destinationIdsSchema,
    regenerateVideo: { type: "boolean" },
  },
  additionalProperties: false,
  minProperties: 1,
};

const reviseInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    relayId: idSchema("The relay identifier."),
    baseRevision: { type: "integer", minimum: 1 },
    changes: revisionChangesSchema,
  },
  required: ["relayId", "baseRevision", "changes"],
  additionalProperties: false,
};

const queueInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    relayId: idSchema("The relay identifier."),
    revision: { type: "integer", minimum: 1 },
    destinationIds: destinationIdsSchema,
  },
  required: ["relayId", "revision", "destinationIds"],
  additionalProperties: false,
};

const releaseInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    relayId: idSchema("The relay identifier."),
    revision: { type: "integer", minimum: 1 },
    queueItemIds: queueItemIdsSchema,
    approved: {
      type: "boolean",
      const: true,
      description: "Must be true and correspond to the creator's visible approval action.",
    },
    approvalToken: {
      type: "string",
      minLength: 8,
      maxLength: 256,
      description: "Revision-bound token issued only by recordUiApproval in the visible UI.",
    },
    idempotencyKey: {
      type: "string",
      minLength: 8,
      maxLength: 128,
      description: "Stable retry key for this exact release payload.",
    },
  },
  required: [
    "relayId",
    "revision",
    "queueItemIds",
    "approved",
    "approvalToken",
    "idempotencyKey",
  ],
  additionalProperties: false,
};

const statusInputSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    relayId: idSchema("The relay identifier."),
    revision: { type: "integer", minimum: 1 },
  },
  required: ["relayId", "revision"],
  additionalProperties: false,
};

export const LIVE_RELAY_INPUT_SCHEMAS: Readonly<
  Record<LiveRelayToolName, JsonSchema>
> = {
  get_live_relay_context: emptyInputSchema,
  find_active_live: findActiveLiveInputSchema,
  draft_live_relay: draftInputSchema,
  get_live_relay: getRelayInputSchema,
  revise_live_relay: reviseInputSchema,
  queue_live_relay: queueInputSchema,
  release_live_relay: releaseInputSchema,
  get_live_relay_status: statusInputSchema,
};

const resultEnvelopeSchema: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  description:
    "A typed OperationResult: success contains data and optional actionable warnings; failure contains an actionable error.",
};

const definition = <Name extends LiveRelayToolName>(
  name: Name,
  title: string,
  description: string,
  annotations: LiveRelayToolAnnotations,
): LiveRelayToolDefinition<Name> => ({
  name,
  title,
  description,
  inputSchema: LIVE_RELAY_INPUT_SCHEMAS[name],
  outputSchema: resultEnvelopeSchema,
  annotations,
});

const readAnnotations: LiveRelayToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
};

/** Metadata for exactly the eight page tools; execute handlers are attached by createLiveRelayTools. */
export const LIVE_RELAY_TOOL_DEFINITIONS = [
  definition(
    "get_live_relay_context",
    "Get Live Relay context",
    "Read the current signed-in Live Relay board context, eligible exact accounts, constraints, credits, and unavailable destinations. Returns no credentials or provider tokens.",
    readAnnotations,
  ),
  definition(
    "find_active_live",
    "Find active live",
    "Read a verified active broadcast from the connected YouTube channel, or accept the creator's explicit YouTube/TikTok live declaration. Never invents a live event.",
    readAnnotations,
  ),
  definition(
    "draft_live_relay",
    "Draft Live Relay",
    "Create a versioned 12-second 9:16 relay draft and generation jobs in Sigmora. This can consume one product credit but never publishes externally.",
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  ),
  definition(
    "get_live_relay",
    "Get Live Relay",
    "Read the current relay revision, honest generation progress, usable media readiness, previews, fit checks, queue state, and revision-bound approval.",
    readAnnotations,
  ),
  definition(
    "revise_live_relay",
    "Revise Live Relay",
    "Create a new relay revision from explicit changes. This invalidates any approval for the previous revision and never publishes externally.",
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  ),
  definition(
    "queue_live_relay",
    "Queue Live Relay for review",
    "Idempotently create review-required queue items for exact connected destination accounts. This never approves or publishes them externally.",
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  ),
  definition(
    "release_live_relay",
    "Release approved Live Relay",
    "Consequentially publish only the exact queue items covered by an explicit visible UI approval token for this revision. Retries with the same key never create duplicate posts.",
    { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  ),
  definition(
    "get_live_relay_status",
    "Get Live Relay delivery status",
    "Read independent per-destination publishing states, simulated post receipts, and actionable failures for an exact relay revision.",
    readAnnotations,
  ),
] as const satisfies readonly LiveRelayToolDefinition[];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const describePath = (path: string): string => (path.length > 0 ? path : "input");

const validateSchema = (schema: JsonSchema, value: unknown, path = ""): string[] => {
  const errors: string[] = [];
  const label = describePath(path);

  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (candidate) => validateSchema(candidate, value, path).length === 0,
    ).length;
    if (matches !== 1) {
      errors.push(`${label} must match exactly one supported shape`);
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${label} must equal ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    errors.push(`${label} must be one of ${schema.enum.map(String).join(", ")}`);
    return errors;
  }

  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) {
        errors.push(`${label} must be an object`);
        return errors;
      }
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
        errors.push(`${label} must contain at least ${schema.minProperties} change`);
      }
      for (const required of schema.required ?? []) {
        if (!Object.prototype.hasOwnProperty.call(value, required)) {
          errors.push(`${label}.${required} is required`);
        }
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(schema.properties ?? {}));
        for (const key of keys) {
          if (!allowed.has(key)) {
            errors.push(`${label}.${key} is not allowed`);
          }
        }
      }
      for (const [key, childSchema] of Object.entries(schema.properties ?? {})) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(...validateSchema(childSchema, value[key], path ? `${path}.${key}` : key));
        }
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${label} must be an array`);
        return errors;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push(`${label} must contain at least ${schema.minItems} item`);
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(`${label} must contain no more than ${schema.maxItems} items`);
      }
      if (schema.uniqueItems) {
        const encoded = value.map((item) => JSON.stringify(item));
        if (new Set(encoded).size !== encoded.length) {
          errors.push(`${label} must contain unique items`);
        }
      }
      if (schema.items) {
        value.forEach((item, index) => {
          errors.push(...validateSchema(schema.items as JsonSchema, item, `${path}[${index}]`));
        });
      }
      break;
    }
    case "string": {
      if (typeof value !== "string") {
        errors.push(`${label} must be a string`);
        return errors;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${label} is too short`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${label} is too long`);
      }
      if (schema.format === "uri") {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            errors.push(`${label} must use http or https`);
          }
        } catch {
          errors.push(`${label} must be a valid URL`);
        }
      }
      break;
    }
    case "integer":
      if (!Number.isInteger(value)) {
        errors.push(`${label} must be an integer`);
        return errors;
      }
      if (schema.minimum !== undefined && (value as number) < schema.minimum) {
        errors.push(`${label} must be at least ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && (value as number) > schema.maximum) {
        errors.push(`${label} must be no more than ${schema.maximum}`);
      }
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push(`${label} must be a finite number`);
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${label} must be a boolean`);
      break;
    case "null":
      if (value !== null) errors.push(`${label} must be null`);
      break;
    default:
      break;
  }

  return errors;
};

export interface InputValidationSuccess<Name extends LiveRelayToolName> {
  readonly ok: true;
  readonly value: LiveRelayToolInputMap[Name];
}

export interface InputValidationFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export const validateLiveRelayToolInput = <Name extends LiveRelayToolName>(
  name: Name,
  input: unknown,
): InputValidationSuccess<Name> | InputValidationFailure => {
  const errors = validateSchema(LIVE_RELAY_INPUT_SCHEMAS[name], input);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as LiveRelayToolInputMap[Name] };
};

// Compile-time guard: a missing or extra definition cannot silently change the tool surface.
const definitionNames: readonly LiveRelayToolName[] = LIVE_RELAY_TOOL_DEFINITIONS.map(
  ({ name }) => name,
);
void LIVE_RELAY_TOOL_NAMES;
void definitionNames;
