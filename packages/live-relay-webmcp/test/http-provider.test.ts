import { describe, expect, it, vi } from "vitest";

import {
  createHttpLiveRelayProvider,
  createLiveRelayController,
  type ApprovalReceipt,
  type LiveRelayContext,
  type LiveRelayFetch,
  type OperationResult,
} from "../src/index.js";

const productionContext: LiveRelayContext = {
  workspace: { id: "workspace-production", slug: "creator", name: "Creator workspace" },
  brand: { id: "brand-production", name: "Creator brand", voice: "Direct and warm" },
  project: { id: "project-production", name: "Live launch" },
  page: { route: "/live-relay", boardId: "board-production" },
  credits: { remaining: 8, draftCost: 1, canDraft: true },
  eligibleDestinations: [],
  unavailableDestinations: [],
  selectedDestinationIds: [],
  simulation: { enabled: false, label: "SIGMORA PRODUCTION PROVIDER" },
};

const approvalReceipt: ApprovalReceipt = {
  receiptId: "approval-production-1",
  approvalToken: "approval-token-production-1",
  relayId: "relay-production-1",
  revision: 1,
  queueItemIds: ["queue-production-1"],
  approved: true,
  approvedBy: "Creator",
  approvedAt: "2026-08-29T12:00:00.000Z",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

describe("HTTP Live Relay provider", () => {
  it("separates credentialed operations from the visible UI-approval endpoint", async () => {
    const fetcher = vi.fn<LiveRelayFetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: productionContext }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: approvalReceipt }));
    const provider = createHttpLiveRelayProvider({
      basePath: "/api/workspaces/creator/live-relay/",
      fetcher,
    });

    const context = await provider.getLiveRelayContext({});
    expect(context).toEqual({ ok: true, data: productionContext });
    const approval = await provider.recordUiApproval({
      relayId: approvalReceipt.relayId,
      revision: approvalReceipt.revision,
      queueItemIds: approvalReceipt.queueItemIds,
      approved: true,
      approvedBy: "Creator",
    });
    expect(approval).toEqual({ ok: true, data: approvalReceipt });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/workspaces/creator/live-relay/operations",
      "/api/workspaces/creator/live-relay/approval",
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        mode: "same-origin",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      operation: "get_live_relay_context",
      input: {},
    });
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({
      operation: "record_ui_approval",
      input: { relayId: "relay-production-1", approved: true },
    });
  });

  it("routes all eight tool operations to operations and only UI approval to approval", async () => {
    const unavailable = {
      ok: false as const,
      error: {
        code: "unknown_delivery_state" as const,
        message: "No operation was executed in this routing test.",
        action: "Use the production handler.",
        retryable: true,
      },
    };
    const fetcher = vi.fn<LiveRelayFetch>().mockImplementation(
      async () => jsonResponse(unavailable, 503),
    );
    const provider = createHttpLiveRelayProvider({ basePath: "/api/live-relay", fetcher });
    const brief = {
      tone: "high_energy" as const,
      cta: "Join now",
      durationSeconds: 12 as const,
      aspectRatio: "9:16" as const,
    };

    await provider.getLiveRelayContext({});
    await provider.findActiveLive({ mode: "discover_youtube" });
    await provider.draftLiveRelay({
      liveEventId: "live-1",
      destinationIds: ["destination-1"],
      brief,
    });
    await provider.getLiveRelay({ relayId: "relay-1" });
    await provider.reviseLiveRelay({
      relayId: "relay-1",
      baseRevision: 1,
      changes: { cta: "Join before the reveal" },
    });
    await provider.queueLiveRelay({
      relayId: "relay-1",
      revision: 1,
      destinationIds: ["destination-1"],
    });
    await provider.releaseLiveRelay({
      relayId: "relay-1",
      revision: 1,
      queueItemIds: ["queue-1"],
      approved: true,
      approvalToken: "approval-token-1",
      idempotencyKey: "release-key-1",
    });
    await provider.getLiveRelayStatus({ relayId: "relay-1", revision: 1 });
    await provider.recordUiApproval({
      relayId: "relay-1",
      revision: 1,
      queueItemIds: ["queue-1"],
      approved: true,
    });

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      ...Array.from({ length: 8 }, () => "/api/live-relay/operations"),
      "/api/live-relay/approval",
    ]);
    expect(fetcher.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)).operation,
    )).toEqual([
      "get_live_relay_context",
      "find_active_live",
      "draft_live_relay",
      "get_live_relay",
      "revise_live_relay",
      "queue_live_relay",
      "release_live_relay",
      "get_live_relay_status",
      "record_ui_approval",
    ]);
  });

  it.each([
    "https://api.sigmora.org/live-relay",
    "//api.sigmora.org/live-relay",
    "/api/live-relay?workspace=other",
    "/api/live-relay#fragment",
    "/api/%2e%2e/private",
    "/api%2flive-relay",
  ])("rejects a non-local or ambiguous base path: %s", (basePath) => {
    expect(() => createHttpLiveRelayProvider({ basePath, fetcher: vi.fn() })).toThrow(
      /basePath/,
    );
  });

  it("rejects malformed success bodies instead of fabricating reference state", async () => {
    const fetcher = vi.fn<LiveRelayFetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          ...productionContext,
          simulation: { enabled: "false", label: "not a boolean" },
        },
      }),
    );
    const provider = createHttpLiveRelayProvider({ fetcher });
    const result = await provider.getLiveRelayContext({});

    expect(result).toMatchObject({
      ok: false,
      error: { code: "unknown_delivery_state", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("WebMCP judge workspace");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe URLs in otherwise well-shaped server data", async () => {
    const fetcher = vi.fn<LiveRelayFetch>().mockResolvedValue(jsonResponse({
      ok: true,
      data: {
        event: {
          id: "live-production-1",
          platform: "youtube",
          title: "Production live",
          url: "javascript:alert(document.domain)",
          status: "active",
          source: "youtube_api",
          verified: true,
          selectedAt: "2026-08-29T12:00:00.000Z",
        },
        fallbackUsed: false,
      },
    }));
    const result = await createHttpLiveRelayProvider({ fetcher }).findActiveLive({
      mode: "discover_youtube",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "unknown_delivery_state", retryable: false },
    });
  });

  it("passes through a valid actionable non-2xx failure but rejects malformed error bodies", async () => {
    const validFailure = {
      ok: false as const,
      error: {
        code: "needs_connection" as const,
        message: "The production YouTube account is not connected.",
        action: "Connect the exact account and retry.",
        retryable: true,
      },
    };
    const fetcher = vi.fn<LiveRelayFetch>()
      .mockResolvedValueOnce(jsonResponse(validFailure, 409))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: {
          ...validFailure.error,
          code: "made_up_server_error",
          internalStack: "must never be trusted",
        },
      }, 503));
    const provider = createHttpLiveRelayProvider({ fetcher });

    expect(await provider.getLiveRelayContext({})).toEqual(validFailure);
    expect(await provider.getLiveRelayContext({})).toMatchObject({
      ok: false,
      error: { code: "unknown_delivery_state", retryable: false, details: { status: 503 } },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful result carried by a non-2xx response", async () => {
    const fetcher = vi.fn<LiveRelayFetch>().mockResolvedValue(
      jsonResponse({ ok: true, data: productionContext }, 503),
    );
    const result = await createHttpLiveRelayProvider({ fetcher }).getLiveRelayContext({});
    expect(result).toMatchObject({
      ok: false,
      error: { code: "unknown_delivery_state", details: { status: 503 } },
    });
  });

  it("fails closed for non-JSON and oversized responses", async () => {
    const fetcher = vi.fn<LiveRelayFetch>()
      .mockResolvedValueOnce(new Response("service unavailable", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      }))
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": "4096",
        },
      }));
    const provider = createHttpLiveRelayProvider({ fetcher, maxResponseBytes: 1_024 });

    expect(await provider.getLiveRelayContext({})).toMatchObject({
      ok: false,
      error: { code: "unknown_delivery_state", retryable: false },
    });
    expect(await provider.getLiveRelayContext({})).toMatchObject({
      ok: false,
      error: {
        code: "unknown_delivery_state",
        details: { maxResponseBytes: 1_024 },
      },
    });
  });

  it("times out without retrying or falling back", async () => {
    const fetcher = vi.fn<LiveRelayFetch>((_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
    );
    const provider = createHttpLiveRelayProvider({ fetcher, timeoutMs: 5 });

    const result = await provider.getLiveRelayContext({});
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "operation_cancelled",
        retryable: true,
        details: { timeoutMs: 5 },
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("propagates a controller AbortSignal into the HTTP request", async () => {
    let transportSignal: AbortSignal | undefined;
    const fetcher = vi.fn<LiveRelayFetch>((_input, init) => {
      transportSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    });
    const controller = createLiveRelayController(
      createHttpLiveRelayProvider({ fetcher, timeoutMs: 10_000 }),
    );
    const caller = new AbortController();
    const pending = controller.getLiveRelayContext({}, { signal: caller.signal });
    caller.abort("test cancellation");
    const result: OperationResult<LiveRelayContext> = await pending;

    expect(transportSignal?.aborted).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "operation_cancelled", retryable: true },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
