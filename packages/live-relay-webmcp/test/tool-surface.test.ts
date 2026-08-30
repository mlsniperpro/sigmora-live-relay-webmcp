import { describe, expect, it } from "vitest";

import {
  LIVE_RELAY_TOOL_DEFINITIONS,
  LIVE_RELAY_TOOL_NAMES,
  createInMemoryLiveRelayProvider,
  createLiveRelayController,
  createLiveRelayTools,
  isWebMcpAvailable,
  registerLiveRelayWebMcp,
  type JsonSchema,
  type LiveRelayWebMcpTool,
  type WebMcpDocument,
} from "../src/index.js";

const expectedNames = [
  "get_live_relay_context",
  "find_active_live",
  "draft_live_relay",
  "get_live_relay",
  "revise_live_relay",
  "queue_live_relay",
  "release_live_relay",
  "get_live_relay_status",
];

const assertClosedObjects = (schema: JsonSchema): void => {
  if (schema.type === "object" && schema.properties) {
    expect(schema.additionalProperties).toBe(false);
  }
  Object.values(schema.properties ?? {}).forEach(assertClosedObjects);
  if (schema.items) assertClosedObjects(schema.items);
  schema.oneOf?.forEach(assertClosedObjects);
};

describe("Live Relay tool surface", () => {
  it("exports exactly eight discoverable tools with narrow schemas and truthful annotations", () => {
    expect([...LIVE_RELAY_TOOL_NAMES]).toEqual(expectedNames);
    expect(LIVE_RELAY_TOOL_DEFINITIONS).toHaveLength(8);
    expect(LIVE_RELAY_TOOL_DEFINITIONS.map(({ name }) => name)).toEqual(expectedNames);
    for (const definition of LIVE_RELAY_TOOL_DEFINITIONS) {
      expect(definition.description.length).toBeGreaterThan(40);
      expect(definition.inputSchema.additionalProperties).toBe(false);
      assertClosedObjects(definition.inputSchema);
      expect(typeof definition.annotations.readOnlyHint).toBe("boolean");
      expect(typeof definition.annotations.destructiveHint).toBe("boolean");
      expect(typeof definition.annotations.idempotentHint).toBe("boolean");
    }
    const release = LIVE_RELAY_TOOL_DEFINITIONS.find(
      ({ name }) => name === "release_live_relay",
    );
    expect(release?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it("rejects undeclared runtime input properties even without a browser validator", async () => {
    const controller = createLiveRelayController(createInMemoryLiveRelayProvider());
    const result = await controller.execute("get_live_relay_context", { leak: true });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });

  it("registers on an injectable top-level document and caller teardown removes the route tools", async () => {
    const registered = new Map<string, LiveRelayWebMcpTool>();
    const modelContext = {
      registerTool(tool: LiveRelayWebMcpTool, options?: { signal?: AbortSignal }) {
        registered.set(tool.name, tool);
        options?.signal?.addEventListener("abort", () => registered.delete(tool.name), {
          once: true,
        });
      },
    };
    const fakeDocument: WebMcpDocument = { modelContext };
    const controller = createLiveRelayController(createInMemoryLiveRelayProvider());
    const updates: string[] = [];
    controller.subscribe((update) => updates.push(`${update.source}:${update.operation}`));

    expect(isWebMcpAvailable(fakeDocument)).toBe(true);
    const registration = await registerLiveRelayWebMcp({
      controller,
      document: fakeDocument,
    });
    expect(registration.available).toBe(true);
    expect([...registered.keys()]).toEqual(expectedNames);

    const contextTool = registered.get("get_live_relay_context");
    const result = await contextTool?.execute({});
    expect(result?.ok).toBe(true);
    expect(updates).toContain("webmcp:get_live_relay_context");

    await registration.teardown();
    await registration.teardown();
    expect(registered.size).toBe(0);
  });

  it("keeps all tools available to manual UI when WebMCP is absent", async () => {
    const controller = createLiveRelayController(createInMemoryLiveRelayProvider());
    expect(createLiveRelayTools(controller)).toHaveLength(8);
    expect(isWebMcpAvailable({})).toBe(false);
    const registration = await registerLiveRelayWebMcp({ controller, document: {} });
    expect(registration).toMatchObject({
      available: false,
      registeredToolNames: [],
      reason: "api_unavailable",
    });
    const manualResult = await controller.getLiveRelayContext({});
    expect(manualResult.ok).toBe(true);
    await registration.teardown();
  });
});
