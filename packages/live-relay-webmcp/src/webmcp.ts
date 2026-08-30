import type {
  LiveRelayController,
} from "./controller.js";
import {
  LIVE_RELAY_TOOL_NAMES,
  type LiveRelayToolName,
  type LiveRelayToolResultMap,
} from "./contracts.js";
import {
  LIVE_RELAY_TOOL_DEFINITIONS,
  type JsonSchema,
  type LiveRelayToolAnnotations,
} from "./schemas.js";

export interface WebMcpExecuteOptions {
  readonly signal?: AbortSignal;
}

export interface LiveRelayWebMcpTool<Name extends LiveRelayToolName = LiveRelayToolName> {
  readonly name: Name;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  /** Retained as inspectable package metadata; current WebMCP implementations may ignore it. */
  readonly outputSchema: JsonSchema;
  readonly annotations: LiveRelayToolAnnotations;
  readonly execute: (
    input: unknown,
    options?: WebMcpExecuteOptions,
  ) => Promise<LiveRelayToolResultMap[Name]>;
}

export interface WebMcpModelContext {
  registerTool(
    tool: LiveRelayWebMcpTool,
    options?: { readonly signal?: AbortSignal },
  ): Promise<void> | void;
  /** Optional compatibility hook; the current draft unregisters by aborting registration.signal. */
  unregisterTool?(name: string): Promise<void> | void;
}

export interface WebMcpDocument {
  readonly modelContext?: WebMcpModelContext;
  readonly defaultView?: {
    readonly top?: unknown;
  } | null;
}

export interface RegisterLiveRelayWebMcpOptions {
  readonly controller: LiveRelayController;
  /** Defaults to globalThis.document when present; injectable for SSR and contract tests. */
  readonly document?: WebMcpDocument;
}

export type WebMcpUnavailableReason =
  | "api_unavailable"
  | "not_top_level"
  | "registration_failed";

export interface WebMcpRegistration {
  readonly available: boolean;
  readonly registeredToolNames: readonly LiveRelayToolName[];
  readonly reason?: WebMcpUnavailableReason;
  teardown(): Promise<void>;
}

const resolveDocument = (candidate?: WebMcpDocument): WebMcpDocument | undefined => {
  if (candidate) return candidate;
  if (typeof document === "undefined") return undefined;
  return document as unknown as WebMcpDocument;
};

const isTopLevelDocument = (candidate: WebMcpDocument): boolean => {
  const view = candidate.defaultView;
  if (!view || view.top === undefined) return true;
  return view.top === view;
};

export const isWebMcpAvailable = (candidate?: WebMcpDocument): boolean => {
  const target = resolveDocument(candidate);
  return Boolean(
    target &&
      isTopLevelDocument(target) &&
      typeof target.modelContext?.registerTool === "function",
  );
};

/** Attach execute callbacks without creating a second workflow implementation. */
export const createLiveRelayTools = (
  controller: LiveRelayController,
): readonly LiveRelayWebMcpTool[] =>
  LIVE_RELAY_TOOL_DEFINITIONS.map((definition) => ({
    ...definition,
    execute: (input: unknown, options: WebMcpExecuteOptions = {}) =>
      controller.execute(definition.name, input, {
        source: "webmcp",
        ...(options.signal ? { signal: options.signal } : {}),
      }),
  }));

/**
 * Register all eight tools on the caller's current top-level route.
 * Calling teardown (for example from a route effect cleanup) removes only this registration.
 */
export const registerLiveRelayWebMcp = async (
  options: RegisterLiveRelayWebMcpOptions,
): Promise<WebMcpRegistration> => {
  const target = resolveDocument(options.document);
  const noOp = async (): Promise<void> => {};
  if (!target?.modelContext || typeof target.modelContext.registerTool !== "function") {
    return {
      available: false,
      registeredToolNames: [],
      reason: "api_unavailable",
      teardown: noOp,
    };
  }
  if (!isTopLevelDocument(target)) {
    return {
      available: false,
      registeredToolNames: [],
      reason: "not_top_level",
      teardown: noOp,
    };
  }

  const modelContext = target.modelContext;
  const controllers = new Map<LiveRelayToolName, AbortController>();
  const registered: LiveRelayToolName[] = [];
  let tornDown = false;
  const teardown = async (): Promise<void> => {
    if (tornDown) return;
    tornDown = true;
    for (const controller of controllers.values()) controller.abort();
    if (typeof modelContext.unregisterTool === "function") {
      await Promise.all(
        [...registered].reverse().map(async (name) => {
          await modelContext.unregisterTool?.(name);
        }),
      );
    }
    registered.splice(0, registered.length);
    controllers.clear();
  };

  try {
    for (const tool of createLiveRelayTools(options.controller)) {
      const controller = new AbortController();
      controllers.set(tool.name, controller);
      await modelContext.registerTool(tool, { signal: controller.signal });
      registered.push(tool.name);
    }
  } catch {
    await teardown();
    return {
      available: false,
      registeredToolNames: [],
      reason: "registration_failed",
      teardown: noOp,
    };
  }

  return {
    available: true,
    registeredToolNames: [...LIVE_RELAY_TOOL_NAMES],
    teardown,
  };
};
