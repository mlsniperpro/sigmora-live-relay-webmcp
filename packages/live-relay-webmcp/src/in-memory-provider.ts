import type {
  ActionableFailure,
  ApprovalReceipt,
  DestinationAvailability,
  DestinationFitCheck,
  DestinationPlatform,
  DraftLiveRelayInput,
  EligibleDestination,
  FindActiveLiveData,
  FindActiveLiveInput,
  GenerationJob,
  GetLiveRelayContextInput,
  GetLiveRelayInput,
  GetLiveRelayStatusInput,
  InMemoryLiveRelayProviderOptions,
  LiveEvent,
  LiveRelayContext,
  LiveRelayDelivery,
  LiveRelayOverallStatus,
  LiveRelayProvider,
  LiveRelayStatus,
  LiveRelayView,
  OperationFailure,
  OperationResult,
  QueueLiveRelayData,
  QueueLiveRelayInput,
  RecordUiApprovalInput,
  ReferenceDestinationKey,
  RelayApprovalState,
  RelayQueueItem,
  RelayVideoAsset,
  ReleaseLiveRelayData,
  ReleaseLiveRelayInput,
  ReviseLiveRelayInput,
  SimulatedReleaseFailure,
  UnavailableDestination,
} from "./contracts.js";
import { REFERENCE_LIVE_RELAY_MEDIA_URL } from "./reference-media.js";

export const REFERENCE_DESTINATION_IDS = Object.freeze({
  youtube: "destination-youtube-studio",
  tiktok: "destination-tiktok-studio",
  instagram: "destination-instagram-studio",
  x: "destination-x-studio",
} as const);

interface DestinationTemplate {
  readonly key: ReferenceDestinationKey;
  readonly platform: DestinationPlatform;
  readonly destinationId: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly handle: string;
}

const DESTINATIONS: readonly DestinationTemplate[] = [
  {
    key: "youtube",
    platform: "youtube",
    destinationId: REFERENCE_DESTINATION_IDS.youtube,
    accountId: "account-youtube-studio",
    displayName: "Sigmora Studio YouTube",
    handle: "@sigmorastudio",
  },
  {
    key: "tiktok",
    platform: "tiktok",
    destinationId: REFERENCE_DESTINATION_IDS.tiktok,
    accountId: "account-tiktok-studio",
    displayName: "Sigmora Studio TikTok",
    handle: "@sigmorastudio",
  },
  {
    key: "instagram",
    platform: "instagram",
    destinationId: REFERENCE_DESTINATION_IDS.instagram,
    accountId: "account-instagram-studio",
    displayName: "Sigmora Studio Instagram",
    handle: "@sigmorastudio",
  },
  {
    key: "x",
    platform: "x",
    destinationId: REFERENCE_DESTINATION_IDS.x,
    accountId: "account-x-studio",
    displayName: "Sigmora Studio on X",
    handle: "@sigmorastudio",
  },
];

interface RelayRecord {
  view: LiveRelayView;
  generationPolls: number;
  statusPolls: number;
  approvalReceipt?: ApprovalReceipt;
  deliveries: LiveRelayDelivery[];
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly data: ReleaseLiveRelayData;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sameMembers = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return new Set(left).size === left.length && left.every((item) => rightSet.has(item));
};

const failure = (
  code: ActionableFailure["code"],
  message: string,
  action: string,
  retryable: boolean,
  extras: Pick<ActionableFailure, "destinationId" | "details"> = {},
): ActionableFailure => ({ code, message, action, retryable, ...extras });

const failed = (error: ActionableFailure): OperationFailure => ({ ok: false, error });

const safeSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "post";

/**
 * Deterministic, dependency-free provider for tests, local judging, and non-production demos.
 * Every external receipt is visibly marked simulated.
 */
export class InMemoryLiveRelayProvider implements LiveRelayProvider {
  readonly #options: Required<
    Pick<
      InMemoryLiveRelayProviderOptions,
      | "credits"
      | "generationPollsToReady"
      | "statusPollsToTerminal"
      | "youtubeDiscovery"
      | "readyMediaUrl"
    >
  > &
    InMemoryLiveRelayProviderOptions;

  readonly #startMilliseconds: number;
  readonly #events = new Map<string, LiveEvent>();
  readonly #relays = new Map<string, RelayRecord>();
  readonly #idempotency = new Map<string, IdempotencyRecord>();
  #selectedEventId: string | undefined;
  #relayCounter = 0;
  #tickCounter = 0;
  #remainingCredits: number;
  #externalPostCount = 0;

  constructor(options: InMemoryLiveRelayProviderOptions = {}) {
    const startMilliseconds = Date.parse(options.startTime ?? "2026-08-29T09:00:00.000Z");
    if (!Number.isFinite(startMilliseconds)) {
      throw new TypeError("startTime must be an ISO-8601 timestamp");
    }
    this.#startMilliseconds = startMilliseconds;
    this.#options = {
      ...options,
      credits: Math.max(0, Math.floor(options.credits ?? 5)),
      generationPollsToReady: Math.max(1, Math.floor(options.generationPollsToReady ?? 2)),
      statusPollsToTerminal: Math.max(1, Math.floor(options.statusPollsToTerminal ?? 2)),
      youtubeDiscovery: options.youtubeDiscovery ?? "verified_active",
      readyMediaUrl: options.readyMediaUrl ?? REFERENCE_LIVE_RELAY_MEDIA_URL,
    };
    this.#remainingCredits = this.#options.credits;
  }

  async getLiveRelayContext(
    _input: GetLiveRelayContextInput,
  ): Promise<OperationResult<LiveRelayContext>> {
    return { ok: true, data: clone(this.#buildContext()) };
  }

  async findActiveLive(input: FindActiveLiveInput): Promise<OperationResult<FindActiveLiveData>> {
    if (input.mode === "discover_youtube") {
      if (this.#options.youtubeDiscovery === "missing_connection") {
        return failed(
          failure(
            "needs_connection",
            "YouTube is not connected for this workspace, so an active broadcast cannot be verified.",
            "Connect the intended YouTube channel, or use a creator-declared live URL.",
            true,
          ),
        );
      }
      if (this.#options.youtubeDiscovery === "missing_scope") {
        return failed(
          failure(
            "missing_scope",
            "The YouTube connection does not have the scope required to list active broadcasts.",
            "Reconnect YouTube with live-broadcast read access, or use a creator-declared live URL.",
            true,
          ),
        );
      }
      if (this.#options.youtubeDiscovery === "no_active") {
        return failed(
          failure(
            "no_active_live",
            "The verified YouTube channel has no active broadcast.",
            "Declare the current YouTube or TikTok live with its title and URL.",
            true,
            { details: { declaredFallbackAvailable: true } },
          ),
        );
      }

      const selectedAt = this.#tick();
      const event: LiveEvent = {
        id: "youtube-live-verified-001",
        platform: "youtube",
        title: "Building a creator launch system live",
        url: "https://www.youtube.com/watch?v=sigmora-live-001",
        status: "active",
        source: "youtube_api",
        verified: true,
        channelName: "Sigmora Studio",
        startedAt: "2026-08-29T08:52:00.000Z",
        selectedAt,
      };
      this.#events.set(event.id, event);
      this.#selectedEventId = event.id;
      return { ok: true, data: { event: clone(event), fallbackUsed: false } };
    }

    if (!input.declaration) {
      return failed(
        failure(
          "invalid_input",
          "A declaration is required when mode is use_declared.",
          "Provide platform, title, and an http(s) live URL.",
          false,
        ),
      );
    }

    const event: LiveEvent = {
      id: "creator-declared-live-001",
      platform: input.declaration.platform,
      title: input.declaration.title,
      url: input.declaration.url,
      status: "declared",
      source: "creator_declared",
      verified: false,
      selectedAt: this.#tick(),
    };
    this.#events.set(event.id, event);
    this.#selectedEventId = event.id;
    return { ok: true, data: { event: clone(event), fallbackUsed: true } };
  }

  async draftLiveRelay(input: DraftLiveRelayInput): Promise<OperationResult<LiveRelayView>> {
    const event = this.#events.get(input.liveEventId);
    if (!event) {
      return failed(
        failure(
          "live_event_not_found",
          `Live event ${input.liveEventId} is not selected on this board.`,
          "Call find_active_live first and use the returned event ID.",
          false,
        ),
      );
    }
    const unknownDestination = input.destinationIds.find(
      (destinationId) => !this.#destinationById(destinationId),
    );
    if (unknownDestination) {
      return failed(
        failure(
          "unsupported_destination",
          `Destination ${unknownDestination} is not part of this board.`,
          "Use an exact destination ID returned by get_live_relay_context.",
          false,
          { destinationId: unknownDestination },
        ),
      );
    }

    this.#relayCounter += 1;
    const relayId = `relay-${String(this.#relayCounter).padStart(3, "0")}`;
    const createdAt = this.#tick();
    const hasCredits = this.#remainingCredits > 0;
    if (hasCredits) this.#remainingCredits -= 1;
    const creditFailure = failure(
      "credits_unavailable",
      "The relay draft was preserved, but video generation could not start because no credits remain.",
      "Add a generation credit, then revise with regenerateVideo set to true.",
      true,
    );
    const videoJob: GenerationJob = hasCredits
      ? {
          id: `job-${relayId}-r1-video`,
          kind: "video",
          status: "queued",
          progress: 0,
          createdAt,
          updatedAt: createdAt,
        }
      : {
          id: `job-${relayId}-r1-video`,
          kind: "video",
          status: "failed",
          progress: 0,
          createdAt,
          updatedAt: createdAt,
          failure: creditFailure,
        };
    const copyJob: GenerationJob = {
      id: `job-${relayId}-r1-copy`,
      kind: "copy",
      status: "ready",
      progress: 100,
      createdAt,
      updatedAt: createdAt,
    };
    const video: RelayVideoAsset = {
      status: hasCredits ? "pending" : "blocked",
      durationSeconds: 12,
      aspectRatio: "9:16",
      width: 1080,
      height: 1920,
      container: "mp4",
      simulated: true,
    };
    const view: LiveRelayView = {
      relayId,
      revision: 1,
      revisionId: `${relayId}-r1`,
      phase: hasCredits ? "generating" : "blocked",
      event: clone(event),
      brief: clone(input.brief),
      destinationIds: [...input.destinationIds],
      jobs: [copyJob, videoJob],
      assets: {
        video,
        previews: input.destinationIds.map((destinationId) =>
          this.#preview(destinationId, event.title, input.brief.cta),
        ),
      },
      fitChecks: input.destinationIds.map((destinationId) => ({
        destinationId,
        status: "pending",
        checkedRevision: 1,
        failures: [],
      })),
      queueItems: [],
      approval: { status: "not_requested", revision: 1 },
      failures: hasCredits ? [] : [creditFailure],
      createdAt,
      updatedAt: createdAt,
      simulated: true,
    };
    this.#relays.set(relayId, {
      view,
      generationPolls: 0,
      statusPolls: 0,
      deliveries: [],
    });
    return {
      ok: true,
      data: clone(view),
      ...(hasCredits ? {} : { warnings: [creditFailure] }),
    };
  }

  async getLiveRelay(input: GetLiveRelayInput): Promise<OperationResult<LiveRelayView>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    this.#advanceGeneration(record);
    return { ok: true, data: clone(record.view) };
  }

  async reviseLiveRelay(input: ReviseLiveRelayInput): Promise<OperationResult<LiveRelayView>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    if (record.view.revision !== input.baseRevision) {
      return this.#staleRevision(record.view.revision, input.baseRevision);
    }
    const destinationIds = input.changes.destinationIds ?? record.view.destinationIds;
    const unknownDestination = destinationIds.find(
      (destinationId) => !this.#destinationById(destinationId),
    );
    if (unknownDestination) {
      return failed(
        failure(
          "unsupported_destination",
          `Destination ${unknownDestination} is not part of this board.`,
          "Use an exact destination ID returned by get_live_relay_context.",
          false,
          { destinationId: unknownDestination },
        ),
      );
    }

    const oldView = record.view;
    const revision = oldView.revision + 1;
    const updatedAt = this.#tick();
    const brief = {
      ...oldView.brief,
      ...(input.changes.cta === undefined ? {} : { cta: input.changes.cta }),
      ...(input.changes.tone === undefined ? {} : { tone: input.changes.tone }),
    };
    const captionChanges = new Map(
      (input.changes.captions ?? []).map((change) => [change.destinationId, change.caption]),
    );
    const oldCaptions = new Map(
      oldView.assets.previews.map((preview) => [preview.destinationId, preview.caption]),
    );
    const previews = destinationIds.map((destinationId) => {
      const generated = this.#preview(destinationId, oldView.event.title, brief.cta);
      return {
        ...generated,
        caption:
          captionChanges.get(destinationId) ?? oldCaptions.get(destinationId) ?? generated.caption,
        cta: brief.cta,
      };
    });

    let jobs = [...oldView.jobs];
    let video = oldView.assets.video;
    let failures: readonly ActionableFailure[] = [];
    let phase = oldView.assets.video.status === "ready" ? "ready_for_review" : oldView.phase;
    if (input.changes.regenerateVideo) {
      const hasCredits = this.#remainingCredits > 0;
      if (hasCredits) this.#remainingCredits -= 1;
      const creditFailure = failure(
        "credits_unavailable",
        "The new revision was preserved, but video regeneration could not start because no credits remain.",
        "Add a generation credit and request regeneration again.",
        true,
      );
      jobs = [
        {
          id: `job-${input.relayId}-r${revision}-copy`,
          kind: "copy",
          status: "ready",
          progress: 100,
          createdAt: updatedAt,
          updatedAt,
        },
        {
          id: `job-${input.relayId}-r${revision}-video`,
          kind: "video",
          status: hasCredits ? "queued" : "failed",
          progress: 0,
          createdAt: updatedAt,
          updatedAt,
          ...(hasCredits ? {} : { failure: creditFailure }),
        },
      ];
      video = {
        status: hasCredits ? "pending" : "blocked",
        durationSeconds: 12,
        aspectRatio: "9:16",
        width: 1080,
        height: 1920,
        container: "mp4",
        simulated: true,
      };
      failures = hasCredits ? [] : [creditFailure];
      phase = hasCredits ? "generating" : "blocked";
      record.generationPolls = 0;
    }

    const approval: RelayApprovalState =
      oldView.approval.status === "not_requested"
        ? { status: "not_requested", revision }
        : {
            status: "invalidated",
            revision: oldView.revision,
            invalidatedByRevision: revision,
            reason: "The relay content changed after review. Approve the new revision explicitly.",
          };
    delete record.approvalReceipt;
    record.deliveries = [];
    record.statusPolls = 0;
    record.view = {
      ...oldView,
      revision,
      revisionId: `${input.relayId}-r${revision}`,
      phase: phase as LiveRelayView["phase"],
      brief,
      destinationIds: [...destinationIds],
      jobs,
      assets: { video, previews },
      fitChecks:
        video.status === "ready"
          ? this.#readyFitChecks(destinationIds, revision)
          : destinationIds.map((destinationId) => ({
              destinationId,
              status: "pending" as const,
              checkedRevision: revision,
              failures: [],
            })),
      queueItems: [],
      approval,
      failures,
      updatedAt,
    };
    return {
      ok: true,
      data: clone(record.view),
      ...(failures.length > 0 ? { warnings: clone(failures) } : {}),
    };
  }

  async queueLiveRelay(input: QueueLiveRelayInput): Promise<OperationResult<QueueLiveRelayData>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    if (record.view.revision !== input.revision) {
      return this.#staleRevision(record.view.revision, input.revision);
    }

    const alreadyQueued = record.view.queueItems.filter((item) =>
      input.destinationIds.includes(item.destinationId),
    );
    if (alreadyQueued.length === input.destinationIds.length) {
      return {
        ok: true,
        data: {
          relayId: input.relayId,
          revision: input.revision,
          queueItems: clone(alreadyQueued),
          failures: [],
          approvalRequired: true,
        },
      };
    }

    const queueItems = [...record.view.queueItems];
    const failures: ActionableFailure[] = [];
    for (const destinationId of input.destinationIds) {
      const destination = this.#destinationById(destinationId);
      if (!destination || !record.view.destinationIds.includes(destinationId)) {
        failures.push(
          failure(
            "unsupported_destination",
            `Destination ${destinationId} is not selected on revision ${input.revision}.`,
            "Revise the relay to include that exact board destination before queueing it.",
            false,
            { destinationId },
          ),
        );
        continue;
      }
      const availability = this.#availability(destination.key);
      if (availability !== "eligible") {
        failures.push(this.#availabilityFailure(destination, availability));
        continue;
      }
      if (record.view.assets.video.status !== "ready" || !record.view.assets.video.mediaUrl) {
        failures.push(
          failure(
            record.view.assets.video.status === "blocked"
              ? "generation_failed"
              : "media_not_ready",
            `The 12-second video is not ready for ${destination.displayName}.`,
            "Poll get_live_relay until the video job is ready, or resolve the reported generation blocker.",
            true,
            { destinationId },
          ),
        );
        continue;
      }
      const fit = record.view.fitChecks.find((item) => item.destinationId === destinationId);
      if (!fit || fit.status !== "fits") {
        failures.push(
          fit?.failures[0] ??
            failure(
              "media_not_fit",
              `The generated video does not satisfy ${destination.displayName}'s media constraints.`,
              "Regenerate a 12-second MP4 at 9:16 before queueing this account.",
              true,
              { destinationId },
            ),
        );
        continue;
      }
      const existing = queueItems.find((item) => item.destinationId === destinationId);
      if (existing) continue;
      const preview = record.view.assets.previews.find(
        (item) => item.destinationId === destinationId,
      );
      if (!preview) continue;
      queueItems.push({
        queueItemId: `queue-${input.relayId}-r${input.revision}-${destination.key}`,
        relayId: input.relayId,
        revision: input.revision,
        destinationId,
        accountId: destination.accountId,
        platform: destination.platform,
        status: "review_required",
        reviewRequired: true,
        preview,
        createdAt: this.#tick(),
      });
    }

    const selectedQueueItems = queueItems.filter((item) =>
      input.destinationIds.includes(item.destinationId),
    );
    const approval: RelayApprovalState = {
      status: "pending",
      revision: input.revision,
      queueItemIds: selectedQueueItems.map((item) => item.queueItemId),
    };
    record.view = {
      ...record.view,
      phase: selectedQueueItems.length > 0 ? "queued_for_review" : record.view.phase,
      queueItems,
      approval,
      updatedAt: this.#tick(),
    };
    const data: QueueLiveRelayData = {
      relayId: input.relayId,
      revision: input.revision,
      queueItems: clone(selectedQueueItems),
      failures: clone(failures),
      approvalRequired: true,
    };
    return {
      ok: true,
      data,
      ...(failures.length > 0 ? { warnings: clone(failures) } : {}),
    };
  }

  async recordUiApproval(
    input: RecordUiApprovalInput,
  ): Promise<OperationResult<ApprovalReceipt>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    if (record.view.revision !== input.revision) {
      return this.#staleRevision(record.view.revision, input.revision);
    }
    if (record.approvalReceipt) {
      if (sameMembers(record.approvalReceipt.queueItemIds, input.queueItemIds)) {
        return { ok: true, data: clone(record.approvalReceipt) };
      }
      return failed(
        failure(
          "queue_mismatch",
          "This revision already has an approval for a different exact queue-item set.",
          "Review the visible queue again and approve the intended exact accounts.",
          false,
        ),
      );
    }
    const matchingItems = record.view.queueItems.filter((item) =>
      input.queueItemIds.includes(item.queueItemId),
    );
    if (matchingItems.length !== input.queueItemIds.length) {
      return failed(
        failure(
          "queue_item_not_found",
          "At least one approval target is not a queue item on this relay revision.",
          "Use the exact queueItemIds returned by queue_live_relay.",
          false,
        ),
      );
    }
    const approvedAt = this.#tick();
    const receipt: ApprovalReceipt = {
      receiptId: `approval-${input.relayId}-r${input.revision}-001`,
      approvalToken: `approve_${input.relayId}_r${input.revision}_${input.queueItemIds
        .map((item) => {
          const parts = item.split("-");
          return parts[parts.length - 1] ?? "item";
        })
        .join("_")}`,
      relayId: input.relayId,
      revision: input.revision,
      queueItemIds: [...input.queueItemIds],
      approved: true,
      approvedBy: input.approvedBy?.trim() || "creator",
      approvedAt,
    };
    const approvedIds = new Set(input.queueItemIds);
    record.approvalReceipt = receipt;
    record.view = {
      ...record.view,
      phase: "approved",
      queueItems: record.view.queueItems.map((item) =>
        approvedIds.has(item.queueItemId) ? { ...item, status: "approved" } : item,
      ),
      approval: {
        status: "approved",
        revision: input.revision,
        queueItemIds: [...input.queueItemIds],
        receiptId: receipt.receiptId,
        approvalToken: receipt.approvalToken,
        approvedAt,
      },
      updatedAt: approvedAt,
    };
    return { ok: true, data: clone(receipt) };
  }

  async releaseLiveRelay(
    input: ReleaseLiveRelayInput,
  ): Promise<OperationResult<ReleaseLiveRelayData>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    if (record.view.revision !== input.revision) {
      return this.#staleRevision(record.view.revision, input.revision);
    }
    const fingerprint = JSON.stringify({
      relayId: input.relayId,
      revision: input.revision,
      queueItemIds: [...input.queueItemIds].sort(),
      approved: input.approved,
      approvalToken: input.approvalToken,
    });
    const existingIdempotency = this.#idempotency.get(input.idempotencyKey);
    if (existingIdempotency) {
      if (existingIdempotency.fingerprint !== fingerprint) {
        return failed(
          failure(
            "idempotency_conflict",
            "This idempotency key was already used for a different release payload.",
            "Reuse the key only for an identical retry, or choose a new key after a new approval.",
            false,
          ),
        );
      }
      return { ok: true, data: clone({ ...existingIdempotency.data, replayed: true }) };
    }

    const approval = record.approvalReceipt;
    if (!approval || input.approved !== true) {
      return failed(
        failure(
          "approval_required",
          "External publishing requires an explicit approval from the visible Live Relay UI.",
          "Review the exact accounts and call recordUiApproval before releasing.",
          false,
        ),
      );
    }
    if (
      approval.revision !== input.revision ||
      approval.approvalToken !== input.approvalToken
    ) {
      return failed(
        failure(
          "approval_invalid",
          "The approval token is not valid for this relay revision.",
          "Review and approve the current visible revision again.",
          false,
        ),
      );
    }
    if (!sameMembers(approval.queueItemIds, input.queueItemIds)) {
      return failed(
        failure(
          "queue_mismatch",
          "The requested queue items do not exactly match the items covered by approval.",
          "Release only the exact queueItemIds listed on the approval receipt.",
          false,
        ),
      );
    }

    const queueItems = record.view.queueItems.filter((item) =>
      input.queueItemIds.includes(item.queueItemId),
    );
    if (queueItems.length !== input.queueItemIds.length) {
      return failed(
        failure(
          "queue_item_not_found",
          "At least one release target no longer exists on this revision.",
          "Queue and approve the current exact destination accounts again.",
          false,
        ),
      );
    }

    const alreadyReleased = record.deliveries.length > 0;
    if (!alreadyReleased) {
      record.deliveries = queueItems.map((item) => ({
        queueItemId: item.queueItemId,
        destinationId: item.destinationId,
        platform: item.platform,
        status: "publishing",
        attempt: 1,
        simulated: true,
      }));
      const releasedIds = new Set(input.queueItemIds);
      record.view = {
        ...record.view,
        phase: "publishing",
        queueItems: record.view.queueItems.map((item) =>
          releasedIds.has(item.queueItemId) ? { ...item, status: "publishing" } : item,
        ),
        updatedAt: this.#tick(),
      };
    }
    const status = this.#status(record);
    const data: ReleaseLiveRelayData = {
      ...status,
      idempotencyKey: input.idempotencyKey,
      replayed: alreadyReleased,
    };
    this.#idempotency.set(input.idempotencyKey, { fingerprint, data: clone(data) });
    return { ok: true, data: clone(data) };
  }

  async getLiveRelayStatus(
    input: GetLiveRelayStatusInput,
  ): Promise<OperationResult<LiveRelayStatus>> {
    const record = this.#relays.get(input.relayId);
    if (!record) return this.#relayNotFound(input.relayId);
    if (record.view.revision !== input.revision) {
      return this.#staleRevision(record.view.revision, input.revision);
    }
    this.#advancePublishing(record);
    return { ok: true, data: clone(this.#status(record)) };
  }

  getSimulationStats(): { readonly externalPostCount: number; readonly relayCount: number } {
    return { externalPostCount: this.#externalPostCount, relayCount: this.#relays.size };
  }

  #tick(): string {
    const timestamp = new Date(this.#startMilliseconds + this.#tickCounter * 1_000).toISOString();
    this.#tickCounter += 1;
    return timestamp;
  }

  #buildContext(): LiveRelayContext {
    const eligibleDestinations: EligibleDestination[] = [];
    const unavailableDestinations: UnavailableDestination[] = [];
    for (const destination of DESTINATIONS) {
      const availability = this.#availability(destination.key);
      if (availability === "eligible") {
        eligibleDestinations.push({
          destinationId: destination.destinationId,
          platform: destination.platform,
          accountId: destination.accountId,
          displayName: destination.displayName,
          handle: destination.handle,
          connectionStatus: "connected",
          scopeStatus: "sufficient",
          publishMode: "api",
          reviewRequired: true,
          mediaConstraints: {
            acceptedKinds: ["video"],
            acceptedContainers: ["mp4"],
            aspectRatio: "9:16",
            maxDurationSeconds: 60,
          },
        });
      } else {
        const availabilityError = this.#availabilityFailure(destination, availability);
        unavailableDestinations.push({
          destinationId: destination.destinationId,
          platform: destination.platform,
          availability,
          reason: availabilityError.message,
          action: availabilityError.action,
        });
      }
    }
    unavailableDestinations.push(
      {
        destinationId: "destination-substack-export",
        platform: "substack",
        availability: "unsupported",
        reason: "Substack direct publishing is not available; Sigmora supports draft/export only.",
        action: "Export the generated draft and publish it manually in Substack.",
      },
      {
        destinationId: "destination-threads-export",
        platform: "threads",
        availability: "unsupported",
        reason: "Threads has no working connected publisher in this Live Relay board.",
        action: "Use the generated preview as a manual handoff.",
      },
    );
    const preferred = [
      REFERENCE_DESTINATION_IDS.tiktok,
      REFERENCE_DESTINATION_IDS.instagram,
      REFERENCE_DESTINATION_IDS.x,
    ];
    return {
      workspace: this.#options.workspace ?? {
        id: "workspace-reference-001",
        slug: "sigmora-studio",
        name: "Sigmora Studio",
      },
      brand: this.#options.brand ?? {
        id: "brand-reference-001",
        name: "Sigmora",
        voice: "Clear, energetic, credible, and creator-first.",
      },
      project: this.#options.project ?? {
        id: "project-reference-001",
        name: "WebMCP Challenge Launch",
      },
      page: { route: "/live-relay", boardId: "live-relay-board-reference-001" },
      credits: {
        remaining: this.#remainingCredits,
        draftCost: 1,
        canDraft: this.#remainingCredits >= 1,
      },
      eligibleDestinations,
      unavailableDestinations,
      selectedDestinationIds: preferred.filter((destinationId) =>
        eligibleDestinations.some((destination) => destination.destinationId === destinationId),
      ),
      ...(this.#selectedEventId === undefined
        ? {}
        : { selectedLiveEventId: this.#selectedEventId }),
      simulation: { enabled: true, label: "SIMULATED REFERENCE PROVIDER" },
    };
  }

  #availability(key: ReferenceDestinationKey): DestinationAvailability {
    const configured = this.#options.destinationAvailability?.[key];
    if (configured) return configured;
    if (key === "youtube" && this.#options.youtubeDiscovery === "missing_connection") {
      return "missing_connection";
    }
    if (key === "youtube" && this.#options.youtubeDiscovery === "missing_scope") {
      return "missing_scope";
    }
    return "eligible";
  }

  #availabilityFailure(
    destination: DestinationTemplate,
    availability: Exclude<DestinationAvailability, "eligible">,
  ): ActionableFailure {
    if (availability === "missing_connection") {
      return failure(
        "needs_connection",
        `${destination.displayName} is not connected to this workspace.`,
        `Connect the exact ${destination.platform} account, then queue this destination again.`,
        true,
        { destinationId: destination.destinationId },
      );
    }
    if (availability === "missing_scope") {
      return failure(
        "missing_scope",
        `${destination.displayName} lacks the required publishing scope.`,
        `Reconnect ${destination.platform} with content publishing access.`,
        true,
        { destinationId: destination.destinationId },
      );
    }
    return failure(
      "unsupported_destination",
      `${destination.displayName} has no supported publishing path.`,
      "Use a supported connected account or export the preview for manual posting.",
      false,
      { destinationId: destination.destinationId },
    );
  }

  #destinationById(destinationId: string): DestinationTemplate | undefined {
    return DESTINATIONS.find((destination) => destination.destinationId === destinationId);
  }

  #preview(destinationId: string, title: string, cta: string) {
    const destination = this.#destinationById(destinationId);
    if (!destination) {
      throw new Error(`Unknown reference destination ${destinationId}`);
    }
    const lead: Record<ReferenceDestinationKey, string> = {
      youtube: "We're live on YouTube",
      tiktok: "🔴 WE'RE LIVE",
      instagram: "We just went live ✨",
      x: "We're live:",
    };
    return {
      destinationId,
      platform: destination.platform,
      caption: `${lead[destination.key]} ${title}. ${cta}`,
      cta,
      status: "ready" as const,
    };
  }

  #advanceGeneration(record: RelayRecord): void {
    const videoJob = record.view.jobs.find((job) => job.kind === "video");
    if (!videoJob || videoJob.status === "ready" || videoJob.status === "failed") return;
    record.generationPolls += 1;
    const ready = record.generationPolls >= this.#options.generationPollsToReady;
    const progress = ready
      ? 100
      : Math.max(
          1,
          Math.floor(
            (record.generationPolls / this.#options.generationPollsToReady) * 90,
          ),
        );
    const updatedAt = this.#tick();
    const jobs = record.view.jobs.map((job) =>
      job.kind === "video"
        ? {
            ...job,
            status: ready ? ("ready" as const) : ("running" as const),
            progress,
            updatedAt,
          }
        : job,
    );
    const video: RelayVideoAsset = ready
      ? {
          status: "ready",
          mediaUrl: this.#options.readyMediaUrl,
          durationSeconds: 12,
          aspectRatio: "9:16",
          width: 1080,
          height: 1920,
          container: "mp4",
          simulated: true,
        }
      : { ...record.view.assets.video, status: "pending" };
    record.view = {
      ...record.view,
      phase: ready ? "ready_for_review" : "generating",
      jobs,
      assets: { ...record.view.assets, video },
      fitChecks: ready
        ? this.#readyFitChecks(record.view.destinationIds, record.view.revision)
        : record.view.fitChecks,
      updatedAt,
    };
  }

  #readyFitChecks(
    destinationIds: readonly string[],
    revision: number,
  ): DestinationFitCheck[] {
    const configuredFailures = new Set(this.#options.mediaFitFailures ?? []);
    return destinationIds.map((destinationId) => {
      const destination = this.#destinationById(destinationId);
      const blocked = destination ? configuredFailures.has(destination.key) : true;
      const fitFailure = failure(
        "media_not_fit",
        `The generated media does not fit ${destination?.displayName ?? destinationId}: expected a 12-second 9:16 MP4.`,
        "Regenerate or replace the video with a 12-second 1080x1920 MP4.",
        true,
        { destinationId },
      );
      return {
        destinationId,
        status: blocked ? "blocked" : "fits",
        checkedRevision: revision,
        failures: blocked ? [fitFailure] : [],
      };
    });
  }

  #advancePublishing(record: RelayRecord): void {
    if (!record.deliveries.some((delivery) => delivery.status === "publishing")) return;
    record.statusPolls += 1;
    if (record.statusPolls < this.#options.statusPollsToTerminal) return;
    const updatedAt = this.#tick();
    record.deliveries = record.deliveries.map((delivery) => {
      if (delivery.status !== "publishing") return delivery;
      const destination = this.#destinationById(delivery.destinationId);
      const configuredFailure = destination
        ? this.#options.releaseFailures?.[destination.key]
        : undefined;
      if (configuredFailure) {
        return {
          ...delivery,
          status: "failed",
          failure: this.#publishFailure(delivery.destinationId, configuredFailure),
        };
      }
      this.#externalPostCount += 1;
      const slug = `${record.view.relayId}-r${record.view.revision}`;
      return {
        ...delivery,
        status: "published",
        postId: `sim-${destination?.key ?? "unknown"}-${slug}`,
        postUrl: `https://receipts.sigmora.example/${destination?.key ?? "unknown"}/${safeSlug(slug)}`,
        publishedAt: updatedAt,
      };
    });
    const statusByQueueId = new Map(
      record.deliveries.map((delivery) => [delivery.queueItemId, delivery.status]),
    );
    const overallStatus = this.#overallStatus(record.deliveries);
    record.view = {
      ...record.view,
      phase:
        overallStatus === "published"
          ? "published"
          : overallStatus === "partial_failure"
            ? "partial_failure"
            : overallStatus === "failed"
              ? "failed"
              : "publishing",
      queueItems: record.view.queueItems.map((item) => {
        const status = statusByQueueId.get(item.queueItemId);
        return status === "published" || status === "failed" ? { ...item, status } : item;
      }),
      failures: record.deliveries.flatMap((delivery) =>
        delivery.failure ? [delivery.failure] : [],
      ),
      updatedAt,
    };
  }

  #publishFailure(
    destinationId: string,
    configured: SimulatedReleaseFailure,
  ): ActionableFailure {
    return failure(
      "platform_publish_failed",
      configured.message ?? "The destination rejected the simulated publish attempt.",
      configured.action ?? "Review the destination connection and retry only this failed item.",
      configured.retryable ?? true,
      {
        destinationId,
        ...(configured.code ? { details: { providerCode: configured.code } } : {}),
      },
    );
  }

  #status(record: RelayRecord): LiveRelayStatus {
    let deliveries = record.deliveries;
    if (deliveries.length === 0 && record.view.queueItems.length > 0) {
      deliveries = record.view.queueItems.map((item) => ({
        queueItemId: item.queueItemId,
        destinationId: item.destinationId,
        platform: item.platform,
        status: "pending_approval",
        attempt: 0,
        simulated: true,
      }));
    }
    return {
      relayId: record.view.relayId,
      revision: record.view.revision,
      overallStatus: this.#overallStatus(deliveries),
      deliveries: clone(deliveries),
      updatedAt: record.view.updatedAt,
    };
  }

  #overallStatus(deliveries: readonly LiveRelayDelivery[]): LiveRelayOverallStatus {
    if (deliveries.length === 0) return "unknown";
    if (deliveries.every((delivery) => delivery.status === "pending_approval")) {
      return "pending_approval";
    }
    if (deliveries.some((delivery) => delivery.status === "publishing")) return "publishing";
    const published = deliveries.filter((delivery) => delivery.status === "published").length;
    const failedCount = deliveries.filter((delivery) => delivery.status === "failed").length;
    if (published === deliveries.length) return "published";
    if (failedCount === deliveries.length) return "failed";
    if (published > 0 && failedCount > 0) return "partial_failure";
    return "unknown";
  }

  #relayNotFound<T>(relayId: string): OperationResult<T> {
    return failed(
      failure(
        "relay_not_found",
        `Relay ${relayId} does not exist on this board.`,
        "Use the relayId returned by draft_live_relay.",
        false,
      ),
    );
  }

  #staleRevision<T>(currentRevision: number, suppliedRevision: number): OperationResult<T> {
    return failed(
      failure(
        "stale_revision",
        `Revision ${suppliedRevision} is stale; the visible relay is revision ${currentRevision}.`,
        "Read the current relay, review it, queue it, and approve that exact revision.",
        false,
        { details: { currentRevision, suppliedRevision } },
      ),
    );
  }
}

export const createInMemoryLiveRelayProvider = (
  options: InMemoryLiveRelayProviderOptions = {},
): InMemoryLiveRelayProvider => new InMemoryLiveRelayProvider(options);
