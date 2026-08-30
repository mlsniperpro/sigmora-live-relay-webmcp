import { describe, expect, it } from "vitest";

import {
  REFERENCE_DESTINATION_IDS,
  createInMemoryLiveRelayProvider,
  createLiveRelayController,
} from "../src/index.js";

const brief = {
  tone: "high_energy" as const,
  cta: "Join now.",
  durationSeconds: 12 as const,
  aspectRatio: "9:16" as const,
};

describe("actionable failure paths", () => {
  it("offers a declared fallback when verified YouTube has no active broadcast", async () => {
    const controller = createLiveRelayController(
      createInMemoryLiveRelayProvider({ youtubeDiscovery: "no_active" }),
    );
    const discovery = await controller.findActiveLive({ mode: "discover_youtube" });
    expect(discovery).toMatchObject({
      ok: false,
      error: { code: "no_active_live", details: { declaredFallbackAvailable: true } },
    });
    const fallback = await controller.findActiveLive({
      mode: "use_declared",
      declaration: {
        platform: "tiktok",
        title: "Creator-declared TikTok LIVE",
        url: "https://www.tiktok.com/@sigmorastudio/live",
      },
    });
    expect(fallback).toMatchObject({
      ok: true,
      data: { fallbackUsed: true, event: { verified: false, source: "creator_declared" } },
    });
  });

  it("reports missing YouTube scope without exposing a credential", async () => {
    const provider = createInMemoryLiveRelayProvider({ youtubeDiscovery: "missing_scope" });
    const result = await provider.findActiveLive({ mode: "discover_youtube" });
    expect(result).toMatchObject({ ok: false, error: { code: "missing_scope" } });
    expect(JSON.stringify(result)).not.toMatch(/access_token|refresh_token|client_secret/i);
  });

  it("preserves a credit-blocked draft and never fabricates a media URL", async () => {
    const controller = createLiveRelayController(
      createInMemoryLiveRelayProvider({ credits: 0 }),
    );
    const live = await controller.findActiveLive({ mode: "discover_youtube" });
    if (!live.ok) throw new Error(live.error.message);
    const draft = await controller.draftLiveRelay({
      liveEventId: live.data.event.id,
      destinationIds: [REFERENCE_DESTINATION_IDS.tiktok],
      brief,
    });
    expect(draft).toMatchObject({
      ok: true,
      data: { phase: "blocked", assets: { video: { status: "blocked" } } },
      warnings: [{ code: "credits_unavailable" }],
    });
    expect(draft.ok && draft.data.assets.video.mediaUrl).toBeUndefined();
    if (!draft.ok) return;
    const polled = await controller.getLiveRelay({ relayId: draft.data.relayId });
    expect(polled.ok && polled.data.assets.video.mediaUrl).toBeUndefined();
  });

  it.each([
    ["missing_connection", "needs_connection"],
    ["missing_scope", "missing_scope"],
  ] as const)("blocks queueing for %s with an exact-account action", async (availability, code) => {
    const controller = createLiveRelayController(
      createInMemoryLiveRelayProvider({
        generationPollsToReady: 1,
        destinationAvailability: { tiktok: availability },
      }),
    );
    const live = await controller.findActiveLive({ mode: "discover_youtube" });
    if (!live.ok) throw new Error(live.error.message);
    const draft = await controller.draftLiveRelay({
      liveEventId: live.data.event.id,
      destinationIds: [REFERENCE_DESTINATION_IDS.tiktok],
      brief,
    });
    if (!draft.ok) throw new Error(draft.error.message);
    await controller.getLiveRelay({ relayId: draft.data.relayId });
    const queue = await controller.queueLiveRelay({
      relayId: draft.data.relayId,
      revision: 1,
      destinationIds: [REFERENCE_DESTINATION_IDS.tiktok],
    });
    expect(queue).toMatchObject({
      ok: true,
      data: { queueItems: [], failures: [{ code, destinationId: REFERENCE_DESTINATION_IDS.tiktok }] },
    });
  });

  it("blocks a destination whose generated media fails the fit check", async () => {
    const controller = createLiveRelayController(
      createInMemoryLiveRelayProvider({
        generationPollsToReady: 1,
        mediaFitFailures: ["x"],
      }),
    );
    const live = await controller.findActiveLive({ mode: "discover_youtube" });
    if (!live.ok) throw new Error(live.error.message);
    const draft = await controller.draftLiveRelay({
      liveEventId: live.data.event.id,
      destinationIds: [REFERENCE_DESTINATION_IDS.x],
      brief,
    });
    if (!draft.ok) throw new Error(draft.error.message);
    const ready = await controller.getLiveRelay({ relayId: draft.data.relayId });
    expect(ready).toMatchObject({
      ok: true,
      data: { fitChecks: [{ status: "blocked", failures: [{ code: "media_not_fit" }] }] },
    });
    const queue = await controller.queueLiveRelay({
      relayId: draft.data.relayId,
      revision: 1,
      destinationIds: [REFERENCE_DESTINATION_IDS.x],
    });
    expect(queue).toMatchObject({
      ok: true,
      data: { queueItems: [], failures: [{ code: "media_not_fit" }] },
    });
  });
});
