import { describe, expect, it } from "vitest";

import {
  REFERENCE_DESTINATION_IDS,
  createInMemoryLiveRelayProvider,
  createLiveRelayController,
  type InMemoryLiveRelayProvider,
  type LiveRelayController,
} from "../src/index.js";

const heroDestinations = [
  REFERENCE_DESTINATION_IDS.tiktok,
  REFERENCE_DESTINATION_IDS.instagram,
  REFERENCE_DESTINATION_IDS.x,
];

const draftInput = (liveEventId: string) => ({
  liveEventId,
  destinationIds: heroDestinations,
  brief: {
    tone: "high_energy" as const,
    cta: "Join before the reveal.",
    durationSeconds: 12 as const,
    aspectRatio: "9:16" as const,
  },
});

const readyRelay = async (
  provider: InMemoryLiveRelayProvider = createInMemoryLiveRelayProvider(),
): Promise<{ controller: LiveRelayController; relayId: string }> => {
  const controller = createLiveRelayController(provider);
  const live = await controller.findActiveLive({ mode: "discover_youtube" });
  if (!live.ok) throw new Error(live.error.message);
  const draft = await controller.draftLiveRelay(draftInput(live.data.event.id));
  if (!draft.ok) throw new Error(draft.error.message);
  await controller.getLiveRelay({ relayId: draft.data.relayId });
  const ready = await controller.getLiveRelay({ relayId: draft.data.relayId });
  if (!ready.ok || ready.data.assets.video.status !== "ready") {
    throw new Error("Reference relay did not become ready");
  }
  return { controller, relayId: draft.data.relayId };
};

describe("deterministic Live Relay journey", () => {
  it("uses visible workspace context without exposing secrets", async () => {
    const provider = createInMemoryLiveRelayProvider({
      workspace: { id: "ws-real", slug: "creator-room", name: "Creator Room" },
      brand: { id: "brand-real", name: "Creator Brand", voice: "Direct and warm." },
      project: { id: "project-real", name: "Launch Stream" },
    });
    const result = await provider.getLiveRelayContext({});
    expect(result.ok && result.data.workspace.id).toBe("ws-real");
    expect(result.ok && result.data.brand.name).toBe("Creator Brand");
    expect(JSON.stringify(result)).not.toMatch(/token|secret|oauth|credential/i);
    expect(result.ok && result.data.unavailableDestinations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "substack", availability: "unsupported" }),
      ]),
    );
  });

  it("discovers verified YouTube, reports generation progress, and exposes media only when ready", async () => {
    const controller = createLiveRelayController(
      createInMemoryLiveRelayProvider({ generationPollsToReady: 2 }),
    );
    const live = await controller.findActiveLive({ mode: "discover_youtube" });
    expect(live).toMatchObject({
      ok: true,
      data: { event: { source: "youtube_api", verified: true, status: "active" } },
    });
    if (!live.ok) return;
    const draft = await controller.draftLiveRelay(draftInput(live.data.event.id));
    expect(draft.ok && draft.data.assets.video.mediaUrl).toBeUndefined();
    if (!draft.ok) return;
    const firstPoll = await controller.getLiveRelay({ relayId: draft.data.relayId });
    expect(firstPoll).toMatchObject({
      ok: true,
      data: { assets: { video: { status: "pending" } } },
    });
    expect(firstPoll.ok && firstPoll.data.assets.video.mediaUrl).toBeUndefined();
    const secondPoll = await controller.getLiveRelay({ relayId: draft.data.relayId });
    expect(secondPoll).toMatchObject({
      ok: true,
      data: {
        assets: {
          video: {
            status: "ready",
            durationSeconds: 12,
            aspectRatio: "9:16",
            width: 1080,
            height: 1920,
            container: "mp4",
          },
        },
      },
    });
    expect(secondPoll.ok && secondPoll.data.assets.video.mediaUrl).toMatch(
      /^data:video\/mp4;base64,/,
    );
  });

  it("queues exact review items, requires visible approval, and prevents duplicate posts", async () => {
    const provider = createInMemoryLiveRelayProvider({ statusPollsToTerminal: 1 });
    const { controller, relayId } = await readyRelay(provider);
    const queue = await controller.queueLiveRelay({
      relayId,
      revision: 1,
      destinationIds: heroDestinations,
    });
    expect(queue.ok && queue.data.queueItems).toHaveLength(3);
    if (!queue.ok) return;
    expect(queue.data.queueItems.every((item) => item.status === "review_required")).toBe(true);
    const queueItemIds = queue.data.queueItems.map((item) => item.queueItemId);

    const withoutApproval = await controller.releaseLiveRelay({
      relayId,
      revision: 1,
      queueItemIds,
      approved: true,
      approvalToken: "not-approved-token",
      idempotencyKey: "release-attempt-0001",
    });
    expect(withoutApproval).toMatchObject({ ok: false, error: { code: "approval_required" } });

    const approval = await controller.recordUiApproval({
      relayId,
      revision: 1,
      queueItemIds,
      approved: true,
      approvedBy: "demo creator",
    });
    if (!approval.ok) throw new Error(approval.error.message);
    const releaseInput = {
      relayId,
      revision: 1,
      queueItemIds,
      approved: true as const,
      approvalToken: approval.data.approvalToken,
      idempotencyKey: "release-attempt-0001",
    };
    const first = await controller.releaseLiveRelay(releaseInput);
    const duplicate = await controller.releaseLiveRelay(releaseInput);
    expect(first).toMatchObject({ ok: true, data: { replayed: false } });
    expect(duplicate).toMatchObject({ ok: true, data: { replayed: true } });

    const status = await controller.getLiveRelayStatus({ relayId, revision: 1 });
    expect(status).toMatchObject({ ok: true, data: { overallStatus: "published" } });
    expect(status.ok && status.data.deliveries.every((item) => item.postUrl)).toBe(true);
    expect(provider.getSimulationStats().externalPostCount).toBe(3);
    await controller.releaseLiveRelay({ ...releaseInput, idempotencyKey: "release-attempt-0002" });
    await controller.getLiveRelayStatus({ relayId, revision: 1 });
    expect(provider.getSimulationStats().externalPostCount).toBe(3);
  });

  it("invalidates UI approval and clears stale controller snapshot state after revision", async () => {
    const { controller, relayId } = await readyRelay();
    const queue = await controller.queueLiveRelay({
      relayId,
      revision: 1,
      destinationIds: heroDestinations,
    });
    if (!queue.ok) throw new Error(queue.error.message);
    const queueItemIds = queue.data.queueItems.map((item) => item.queueItemId);
    const approval = await controller.recordUiApproval({
      relayId,
      revision: 1,
      queueItemIds,
      approved: true,
    });
    if (!approval.ok) throw new Error(approval.error.message);
    expect(controller.getSnapshot().approval?.revision).toBe(1);

    const revised = await controller.reviseLiveRelay({
      relayId,
      baseRevision: 1,
      changes: {
        captions: [
          { destinationId: REFERENCE_DESTINATION_IDS.x, caption: "We're live—come say hi." },
        ],
      },
    });
    expect(revised).toMatchObject({
      ok: true,
      data: { revision: 2, approval: { status: "invalidated", invalidatedByRevision: 2 } },
    });
    expect(controller.getSnapshot().approval).toBeUndefined();
    expect(controller.getSnapshot().queue).toBeUndefined();
    expect(controller.getSnapshot().status).toBeUndefined();

    const stale = await controller.releaseLiveRelay({
      relayId,
      revision: 1,
      queueItemIds,
      approved: true,
      approvalToken: approval.data.approvalToken,
      idempotencyKey: "stale-release-0001",
    });
    expect(stale).toMatchObject({ ok: false, error: { code: "stale_revision" } });
  });

  it("returns independent partial-failure receipts and actionable retry guidance", async () => {
    const provider = createInMemoryLiveRelayProvider({
      statusPollsToTerminal: 1,
      releaseFailures: {
        x: {
          code: "rate_limited",
          message: "X rejected the simulated post because the account is rate limited.",
          action: "Wait for the X rate-limit window, then retry only the X queue item.",
        },
      },
    });
    const { controller, relayId } = await readyRelay(provider);
    const queue = await controller.queueLiveRelay({
      relayId,
      revision: 1,
      destinationIds: heroDestinations,
    });
    if (!queue.ok) throw new Error(queue.error.message);
    const ids = queue.data.queueItems.map((item) => item.queueItemId);
    const approval = await controller.recordUiApproval({
      relayId,
      revision: 1,
      queueItemIds: ids,
      approved: true,
    });
    if (!approval.ok) throw new Error(approval.error.message);
    await controller.releaseLiveRelay({
      relayId,
      revision: 1,
      queueItemIds: ids,
      approved: true,
      approvalToken: approval.data.approvalToken,
      idempotencyKey: "partial-release-0001",
    });
    const status = await controller.getLiveRelayStatus({ relayId, revision: 1 });
    expect(status).toMatchObject({ ok: true, data: { overallStatus: "partial_failure" } });
    if (!status.ok) return;
    expect(status.data.deliveries.filter((item) => item.status === "published")).toHaveLength(2);
    expect(status.data.deliveries.find((item) => item.status === "failed")).toMatchObject({
      failure: { code: "platform_publish_failed", retryable: true },
    });
  });
});
