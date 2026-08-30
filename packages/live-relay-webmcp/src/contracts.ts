/** The closed WebMCP surface. Approval is deliberately a visible UI operation, not a ninth tool. */
export const LIVE_RELAY_TOOL_NAMES = [
  "get_live_relay_context",
  "find_active_live",
  "draft_live_relay",
  "get_live_relay",
  "revise_live_relay",
  "queue_live_relay",
  "release_live_relay",
  "get_live_relay_status",
] as const;

export type LiveRelayToolName = (typeof LIVE_RELAY_TOOL_NAMES)[number];

export type DestinationPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "x"
  | "facebook"
  | "linkedin"
  | "substack"
  | "threads"
  | "quora";

export type ReferenceDestinationKey = "youtube" | "tiktok" | "instagram" | "x";

export type DestinationAvailability =
  | "eligible"
  | "missing_connection"
  | "missing_scope"
  | "unsupported";

export type ActionableFailureCode =
  | "invalid_input"
  | "operation_cancelled"
  | "relay_not_found"
  | "live_event_not_found"
  | "no_active_live"
  | "needs_connection"
  | "missing_scope"
  | "unsupported_destination"
  | "credits_unavailable"
  | "generation_in_progress"
  | "generation_failed"
  | "media_not_ready"
  | "media_not_fit"
  | "stale_revision"
  | "approval_required"
  | "approval_invalid"
  | "queue_item_not_found"
  | "queue_mismatch"
  | "idempotency_conflict"
  | "platform_publish_failed"
  | "unknown_delivery_state";

export interface ActionableFailure {
  readonly code: ActionableFailureCode;
  readonly message: string;
  readonly action: string;
  readonly retryable: boolean;
  readonly destinationId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export interface OperationSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly warnings?: readonly ActionableFailure[];
}

export interface OperationFailure {
  readonly ok: false;
  readonly error: ActionableFailure;
}

export type OperationResult<T> = OperationSuccess<T> | OperationFailure;

export interface WorkspaceSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface BrandSummary {
  readonly id: string;
  readonly name: string;
  readonly voice: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
}

export interface DestinationMediaConstraints {
  readonly acceptedKinds: readonly ["video"];
  readonly acceptedContainers: readonly ["mp4"];
  readonly aspectRatio: "9:16";
  readonly maxDurationSeconds: number;
}

export interface EligibleDestination {
  readonly destinationId: string;
  readonly platform: DestinationPlatform;
  readonly accountId: string;
  readonly displayName: string;
  readonly handle: string;
  readonly connectionStatus: "connected";
  readonly scopeStatus: "sufficient";
  readonly publishMode: "api" | "browser_assisted";
  readonly reviewRequired: true;
  readonly mediaConstraints: DestinationMediaConstraints;
}

export interface UnavailableDestination {
  readonly destinationId: string;
  readonly platform: DestinationPlatform;
  readonly availability: Exclude<DestinationAvailability, "eligible">;
  readonly reason: string;
  readonly action: string;
}

export interface LiveRelayContext {
  readonly workspace: WorkspaceSummary;
  readonly brand: BrandSummary;
  readonly project: ProjectSummary;
  readonly page: {
    readonly route: "/live-relay";
    readonly boardId: string;
  };
  readonly credits: {
    readonly remaining: number;
    readonly draftCost: number;
    readonly canDraft: boolean;
  };
  readonly eligibleDestinations: readonly EligibleDestination[];
  readonly unavailableDestinations: readonly UnavailableDestination[];
  readonly selectedDestinationIds: readonly string[];
  readonly selectedLiveEventId?: string;
  readonly simulation: {
    readonly enabled: boolean;
    readonly label: string;
  };
}

export interface LiveEvent {
  readonly id: string;
  readonly platform: "youtube" | "tiktok";
  readonly title: string;
  readonly url: string;
  readonly status: "active" | "declared";
  readonly source: "youtube_api" | "creator_declared";
  readonly verified: boolean;
  readonly channelName?: string;
  readonly startedAt?: string;
  readonly selectedAt: string;
}

export interface GetLiveRelayContextInput {}

export interface FindActiveLiveInput {
  readonly mode: "discover_youtube" | "use_declared";
  readonly declaration?: {
    readonly platform: "youtube" | "tiktok";
    readonly title: string;
    readonly url: string;
  };
}

export interface FindActiveLiveData {
  readonly event: LiveEvent;
  readonly fallbackUsed: boolean;
}

export type RelayTone = "high_energy" | "warm" | "urgent" | "informative";

export interface RelayBrief {
  readonly tone: RelayTone;
  readonly cta: string;
  readonly durationSeconds: 12;
  readonly aspectRatio: "9:16";
}

export interface DraftLiveRelayInput {
  readonly liveEventId: string;
  readonly destinationIds: readonly string[];
  readonly brief: RelayBrief;
}

export interface GetLiveRelayInput {
  readonly relayId: string;
}

export interface CaptionRevision {
  readonly destinationId: string;
  readonly caption: string;
}

export interface RelayRevisionChanges {
  readonly cta?: string;
  readonly tone?: RelayTone;
  readonly captions?: readonly CaptionRevision[];
  readonly destinationIds?: readonly string[];
  readonly regenerateVideo?: boolean;
}

export interface ReviseLiveRelayInput {
  readonly relayId: string;
  readonly baseRevision: number;
  readonly changes: RelayRevisionChanges;
}

export interface QueueLiveRelayInput {
  readonly relayId: string;
  readonly revision: number;
  readonly destinationIds: readonly string[];
}

export interface ReleaseLiveRelayInput {
  readonly relayId: string;
  readonly revision: number;
  readonly queueItemIds: readonly string[];
  readonly approved: true;
  readonly approvalToken: string;
  readonly idempotencyKey: string;
}

export interface GetLiveRelayStatusInput {
  readonly relayId: string;
  readonly revision: number;
}

export type GenerationJobStatus = "queued" | "running" | "ready" | "failed";

export interface GenerationJob {
  readonly id: string;
  readonly kind: "video" | "copy";
  readonly status: GenerationJobStatus;
  readonly progress: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly failure?: ActionableFailure;
}

export interface RelayVideoAsset {
  readonly status: "pending" | "ready" | "blocked" | "failed";
  readonly mediaUrl?: string;
  readonly durationSeconds: 12;
  readonly aspectRatio: "9:16";
  readonly width: 1080;
  readonly height: 1920;
  readonly container: "mp4";
  readonly simulated: boolean;
}

export interface DestinationPreview {
  readonly destinationId: string;
  readonly platform: DestinationPlatform;
  readonly caption: string;
  readonly cta: string;
  readonly status: "ready";
}

export interface DestinationFitCheck {
  readonly destinationId: string;
  readonly status: "pending" | "fits" | "blocked";
  readonly checkedRevision: number;
  readonly failures: readonly ActionableFailure[];
}

export type QueueItemStatus =
  | "review_required"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "unknown";

export interface RelayQueueItem {
  readonly queueItemId: string;
  readonly relayId: string;
  readonly revision: number;
  readonly destinationId: string;
  readonly accountId: string;
  readonly platform: DestinationPlatform;
  readonly status: QueueItemStatus;
  readonly reviewRequired: true;
  readonly preview: DestinationPreview;
  readonly createdAt: string;
}

export type RelayApprovalState =
  | { readonly status: "not_requested"; readonly revision: number }
  | { readonly status: "pending"; readonly revision: number; readonly queueItemIds: readonly string[] }
  | {
      readonly status: "approved";
      readonly revision: number;
      readonly queueItemIds: readonly string[];
      readonly receiptId: string;
      readonly approvalToken: string;
      readonly approvedAt: string;
    }
  | {
      readonly status: "invalidated";
      readonly revision: number;
      readonly invalidatedByRevision: number;
      readonly reason: string;
    };

export type LiveRelayPhase =
  | "generating"
  | "blocked"
  | "ready_for_review"
  | "queued_for_review"
  | "approved"
  | "publishing"
  | "published"
  | "partial_failure"
  | "failed";

export interface LiveRelayView {
  readonly relayId: string;
  readonly revision: number;
  readonly revisionId: string;
  readonly phase: LiveRelayPhase;
  readonly event: LiveEvent;
  readonly brief: RelayBrief;
  readonly destinationIds: readonly string[];
  readonly jobs: readonly GenerationJob[];
  readonly assets: {
    readonly video: RelayVideoAsset;
    readonly previews: readonly DestinationPreview[];
  };
  readonly fitChecks: readonly DestinationFitCheck[];
  readonly queueItems: readonly RelayQueueItem[];
  readonly approval: RelayApprovalState;
  readonly failures: readonly ActionableFailure[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly simulated: boolean;
}

export interface QueueLiveRelayData {
  readonly relayId: string;
  readonly revision: number;
  readonly queueItems: readonly RelayQueueItem[];
  readonly failures: readonly ActionableFailure[];
  readonly approvalRequired: true;
}

export interface RecordUiApprovalInput {
  readonly relayId: string;
  readonly revision: number;
  readonly queueItemIds: readonly string[];
  readonly approved: true;
  readonly approvedBy?: string;
}

export interface ApprovalReceipt {
  readonly receiptId: string;
  readonly approvalToken: string;
  readonly relayId: string;
  readonly revision: number;
  readonly queueItemIds: readonly string[];
  readonly approved: true;
  readonly approvedBy: string;
  readonly approvedAt: string;
}

export interface LiveRelayDelivery {
  readonly queueItemId: string;
  readonly destinationId: string;
  readonly platform: DestinationPlatform;
  readonly status: "pending_approval" | "publishing" | "published" | "failed" | "unknown";
  readonly attempt: number;
  readonly simulated: boolean;
  readonly postId?: string;
  readonly postUrl?: string;
  readonly publishedAt?: string;
  readonly failure?: ActionableFailure;
}

export type LiveRelayOverallStatus =
  | "pending_approval"
  | "publishing"
  | "published"
  | "partial_failure"
  | "failed"
  | "unknown";

export interface LiveRelayStatus {
  readonly relayId: string;
  readonly revision: number;
  readonly overallStatus: LiveRelayOverallStatus;
  readonly deliveries: readonly LiveRelayDelivery[];
  readonly updatedAt: string;
}

export interface ReleaseLiveRelayData extends LiveRelayStatus {
  readonly idempotencyKey: string;
  readonly replayed: boolean;
}

export interface LiveRelayToolInputMap {
  readonly get_live_relay_context: GetLiveRelayContextInput;
  readonly find_active_live: FindActiveLiveInput;
  readonly draft_live_relay: DraftLiveRelayInput;
  readonly get_live_relay: GetLiveRelayInput;
  readonly revise_live_relay: ReviseLiveRelayInput;
  readonly queue_live_relay: QueueLiveRelayInput;
  readonly release_live_relay: ReleaseLiveRelayInput;
  readonly get_live_relay_status: GetLiveRelayStatusInput;
}

export interface LiveRelayToolDataMap {
  readonly get_live_relay_context: LiveRelayContext;
  readonly find_active_live: FindActiveLiveData;
  readonly draft_live_relay: LiveRelayView;
  readonly get_live_relay: LiveRelayView;
  readonly revise_live_relay: LiveRelayView;
  readonly queue_live_relay: QueueLiveRelayData;
  readonly release_live_relay: ReleaseLiveRelayData;
  readonly get_live_relay_status: LiveRelayStatus;
}

export type LiveRelayToolResultMap = {
  readonly [Name in LiveRelayToolName]: OperationResult<LiveRelayToolDataMap[Name]>;
};

export interface LiveRelayProviderRequestOptions {
  readonly signal?: AbortSignal;
}

export interface LiveRelayProvider {
  getLiveRelayContext(
    input: GetLiveRelayContextInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayContext>>;
  findActiveLive(
    input: FindActiveLiveInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<FindActiveLiveData>>;
  draftLiveRelay(
    input: DraftLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>>;
  getLiveRelay(
    input: GetLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>>;
  reviseLiveRelay(
    input: ReviseLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>>;
  queueLiveRelay(
    input: QueueLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<QueueLiveRelayData>>;
  releaseLiveRelay(
    input: ReleaseLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<ReleaseLiveRelayData>>;
  getLiveRelayStatus(
    input: GetLiveRelayStatusInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayStatus>>;
  recordUiApproval(
    input: RecordUiApprovalInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<ApprovalReceipt>>;
}

export interface SimulatedReleaseFailure {
  readonly code?: string;
  readonly message?: string;
  readonly action?: string;
  readonly retryable?: boolean;
}

export interface InMemoryLiveRelayProviderOptions {
  readonly startTime?: string;
  readonly workspace?: WorkspaceSummary;
  readonly brand?: BrandSummary;
  readonly project?: ProjectSummary;
  readonly credits?: number;
  readonly generationPollsToReady?: number;
  readonly statusPollsToTerminal?: number;
  readonly youtubeDiscovery?:
    | "verified_active"
    | "no_active"
    | "missing_connection"
    | "missing_scope";
  readonly destinationAvailability?: Partial<
    Record<ReferenceDestinationKey, DestinationAvailability>
  >;
  readonly mediaFitFailures?: readonly ReferenceDestinationKey[];
  readonly releaseFailures?: Partial<Record<ReferenceDestinationKey, SimulatedReleaseFailure>>;
  readonly readyMediaUrl?: string;
}

export type ControllerInvocationSource = "manual" | "webmcp";

export interface ControllerExecuteOptions {
  readonly source?: ControllerInvocationSource;
  readonly signal?: AbortSignal;
}

export interface LiveRelayControllerSnapshot {
  readonly sequence: number;
  readonly context?: LiveRelayContext;
  readonly selectedLive?: LiveEvent;
  readonly relay?: LiveRelayView;
  readonly queue?: QueueLiveRelayData;
  readonly approval?: ApprovalReceipt;
  readonly status?: LiveRelayStatus;
}

export type ControllerOperation = LiveRelayToolName | "record_ui_approval";

export interface LiveRelayControllerUpdate {
  readonly sequence: number;
  readonly source: ControllerInvocationSource;
  readonly operation: ControllerOperation;
  readonly result: OperationResult<unknown>;
  readonly snapshot: LiveRelayControllerSnapshot;
}

export type LiveRelayControllerListener = (update: LiveRelayControllerUpdate) => void;
