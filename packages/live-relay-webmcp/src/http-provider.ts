import type {
  ActionableFailure,
  ApprovalReceipt,
  DraftLiveRelayInput,
  FindActiveLiveData,
  FindActiveLiveInput,
  GetLiveRelayContextInput,
  GetLiveRelayInput,
  GetLiveRelayStatusInput,
  LiveRelayContext,
  LiveRelayProvider,
  LiveRelayProviderRequestOptions,
  LiveRelayStatus,
  LiveRelayToolDataMap,
  LiveRelayToolInputMap,
  LiveRelayToolName,
  LiveRelayView,
  OperationResult,
  QueueLiveRelayData,
  QueueLiveRelayInput,
  RecordUiApprovalInput,
  ReleaseLiveRelayData,
  ReleaseLiveRelayInput,
  ReviseLiveRelayInput,
} from "./contracts.js";

export const DEFAULT_LIVE_RELAY_HTTP_BASE_PATH = "/api/live-relay";
export const LIVE_RELAY_HTTP_OPERATION_SEGMENT = "operations";
export const LIVE_RELAY_HTTP_APPROVAL_SEGMENT = "approval";
export const DEFAULT_LIVE_RELAY_HTTP_TIMEOUT_MS = 15_000;
export const DEFAULT_LIVE_RELAY_HTTP_MAX_RESPONSE_BYTES = 1_048_576;

export type LiveRelayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface HttpLiveRelayProviderOptions {
  /** Root-relative, same-origin API base for the operations and UI-approval endpoints. */
  readonly basePath?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  /** Test/runtime injection point. Authentication headers are intentionally not configurable here. */
  readonly fetcher?: LiveRelayFetch;
}

type HttpLiveRelayOperation = LiveRelayToolName | "record_ui_approval";

type HttpOperationInputMap = LiveRelayToolInputMap & {
  readonly record_ui_approval: RecordUiApprovalInput;
};

type HttpOperationDataMap = LiveRelayToolDataMap & {
  readonly record_ui_approval: ApprovalReceipt;
};

type JsonObject = Record<string, unknown>;

const FAILURE_CODES = new Set<string>([
  "invalid_input",
  "operation_cancelled",
  "relay_not_found",
  "live_event_not_found",
  "no_active_live",
  "needs_connection",
  "missing_scope",
  "unsupported_destination",
  "credits_unavailable",
  "generation_in_progress",
  "generation_failed",
  "media_not_ready",
  "media_not_fit",
  "stale_revision",
  "approval_required",
  "approval_invalid",
  "queue_item_not_found",
  "queue_mismatch",
  "idempotency_conflict",
  "platform_publish_failed",
  "unknown_delivery_state",
]);

const DESTINATION_PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "facebook",
  "linkedin",
  "substack",
  "threads",
  "quora",
] as const;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: JsonObject, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasExactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is JsonObject => {
  if (!isObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isHttpUrl = (value: unknown): boolean => {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

const isHttpsUrl = (value: unknown): boolean => {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
};

const isSafeMediaUrl = (value: unknown, simulated: boolean): value is string => {
  if (!isNonEmptyString(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return true;
  }
  if (isHttpsUrl(value)) return true;
  return simulated && value.startsWith("data:video/mp4;base64,");
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isIntegerAtLeast = (value: unknown, minimum: number): value is number =>
  Number.isInteger(value) && (value as number) >= minimum;

const isOneOf = (value: unknown, candidates: readonly string[]): value is string =>
  typeof value === "string" && candidates.includes(value);

const isArrayOf = (
  value: unknown,
  predicate: (item: unknown) => boolean,
): value is readonly unknown[] => Array.isArray(value) && value.every(predicate);

const isStringArray = (value: unknown): value is readonly string[] =>
  isArrayOf(value, isNonEmptyString);

const isFailureDetails = (value: unknown): boolean =>
  isObject(value) &&
  Object.values(value).every(
    (item) =>
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item)),
  );

const isActionableFailure = (value: unknown): value is ActionableFailure => {
  if (
    !hasExactKeys(
      value,
      ["code", "message", "action", "retryable"],
      ["destinationId", "details"],
    )
  ) {
    return false;
  }
  return (
    typeof value.code === "string" &&
    FAILURE_CODES.has(value.code) &&
    isNonEmptyString(value.message) &&
    isNonEmptyString(value.action) &&
    typeof value.retryable === "boolean" &&
    (!hasOwn(value, "destinationId") || isNonEmptyString(value.destinationId)) &&
    (!hasOwn(value, "details") || isFailureDetails(value.details))
  );
};

const isWorkspace = (value: unknown): boolean =>
  hasExactKeys(value, ["id", "slug", "name"]) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.slug) &&
  isNonEmptyString(value.name);

const isBrand = (value: unknown): boolean =>
  hasExactKeys(value, ["id", "name", "voice"]) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.voice);

const isProject = (value: unknown): boolean =>
  hasExactKeys(value, ["id", "name"]) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name);

const isMediaConstraints = (value: unknown): boolean =>
  hasExactKeys(value, [
    "acceptedKinds",
    "acceptedContainers",
    "aspectRatio",
    "maxDurationSeconds",
  ]) &&
  Array.isArray(value.acceptedKinds) &&
  value.acceptedKinds.length === 1 &&
  value.acceptedKinds[0] === "video" &&
  Array.isArray(value.acceptedContainers) &&
  value.acceptedContainers.length === 1 &&
  value.acceptedContainers[0] === "mp4" &&
  value.aspectRatio === "9:16" &&
  isFiniteNumber(value.maxDurationSeconds) &&
  value.maxDurationSeconds > 0;

const isEligibleDestination = (value: unknown): boolean =>
  hasExactKeys(value, [
    "destinationId",
    "platform",
    "accountId",
    "displayName",
    "handle",
    "connectionStatus",
    "scopeStatus",
    "publishMode",
    "reviewRequired",
    "mediaConstraints",
  ]) &&
  isNonEmptyString(value.destinationId) &&
  isOneOf(value.platform, DESTINATION_PLATFORMS) &&
  isNonEmptyString(value.accountId) &&
  isNonEmptyString(value.displayName) &&
  isNonEmptyString(value.handle) &&
  value.connectionStatus === "connected" &&
  value.scopeStatus === "sufficient" &&
  isOneOf(value.publishMode, ["api", "browser_assisted"]) &&
  value.reviewRequired === true &&
  isMediaConstraints(value.mediaConstraints);

const isUnavailableDestination = (value: unknown): boolean =>
  hasExactKeys(value, ["destinationId", "platform", "availability", "reason", "action"]) &&
  isNonEmptyString(value.destinationId) &&
  isOneOf(value.platform, DESTINATION_PLATFORMS) &&
  isOneOf(value.availability, ["missing_connection", "missing_scope", "unsupported"]) &&
  isNonEmptyString(value.reason) &&
  isNonEmptyString(value.action);

const isLiveRelayContext = (value: unknown): value is LiveRelayContext => {
  if (
    !hasExactKeys(
      value,
      [
        "workspace",
        "brand",
        "project",
        "page",
        "credits",
        "eligibleDestinations",
        "unavailableDestinations",
        "selectedDestinationIds",
        "simulation",
      ],
      ["selectedLiveEventId"],
    )
  ) {
    return false;
  }
  return (
    isWorkspace(value.workspace) &&
    isBrand(value.brand) &&
    isProject(value.project) &&
    hasExactKeys(value.page, ["route", "boardId"]) &&
    value.page.route === "/live-relay" &&
    isNonEmptyString(value.page.boardId) &&
    hasExactKeys(value.credits, ["remaining", "draftCost", "canDraft"]) &&
    isFiniteNumber(value.credits.remaining) &&
    value.credits.remaining >= 0 &&
    isFiniteNumber(value.credits.draftCost) &&
    value.credits.draftCost >= 0 &&
    typeof value.credits.canDraft === "boolean" &&
    isArrayOf(value.eligibleDestinations, isEligibleDestination) &&
    isArrayOf(value.unavailableDestinations, isUnavailableDestination) &&
    isStringArray(value.selectedDestinationIds) &&
    (!hasOwn(value, "selectedLiveEventId") || isNonEmptyString(value.selectedLiveEventId)) &&
    hasExactKeys(value.simulation, ["enabled", "label"]) &&
    typeof value.simulation.enabled === "boolean" &&
    isNonEmptyString(value.simulation.label)
  );
};

const isLiveEvent = (value: unknown): boolean => {
  if (
    !hasExactKeys(
      value,
      ["id", "platform", "title", "url", "status", "source", "verified", "selectedAt"],
      ["channelName", "startedAt"],
    )
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isOneOf(value.platform, ["youtube", "tiktok"]) &&
    isNonEmptyString(value.title) &&
    isHttpUrl(value.url) &&
    isOneOf(value.status, ["active", "declared"]) &&
    isOneOf(value.source, ["youtube_api", "creator_declared"]) &&
    typeof value.verified === "boolean" &&
    isNonEmptyString(value.selectedAt) &&
    (!hasOwn(value, "channelName") || isNonEmptyString(value.channelName)) &&
    (!hasOwn(value, "startedAt") || isNonEmptyString(value.startedAt))
  );
};

const isFindActiveLiveData = (value: unknown): value is FindActiveLiveData =>
  hasExactKeys(value, ["event", "fallbackUsed"]) &&
  isLiveEvent(value.event) &&
  typeof value.fallbackUsed === "boolean";

const isRelayBrief = (value: unknown): boolean =>
  hasExactKeys(value, ["tone", "cta", "durationSeconds", "aspectRatio"]) &&
  isOneOf(value.tone, ["high_energy", "warm", "urgent", "informative"]) &&
  isNonEmptyString(value.cta) &&
  value.durationSeconds === 12 &&
  value.aspectRatio === "9:16";

const isGenerationJob = (value: unknown): boolean => {
  if (
    !hasExactKeys(
      value,
      ["id", "kind", "status", "progress", "createdAt", "updatedAt"],
      ["failure"],
    )
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isOneOf(value.kind, ["video", "copy"]) &&
    isOneOf(value.status, ["queued", "running", "ready", "failed"]) &&
    isFiniteNumber(value.progress) &&
    value.progress >= 0 &&
    value.progress <= 100 &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    (!hasOwn(value, "failure") || isActionableFailure(value.failure)) &&
    (value.status !== "failed" || isActionableFailure(value.failure))
  );
};

const isVideoAsset = (value: unknown): boolean => {
  if (
    !hasExactKeys(
      value,
      [
        "status",
        "durationSeconds",
        "aspectRatio",
        "width",
        "height",
        "container",
        "simulated",
      ],
      ["mediaUrl"],
    )
  ) {
    return false;
  }
  return (
    isOneOf(value.status, ["pending", "ready", "blocked", "failed"]) &&
    value.durationSeconds === 12 &&
    value.aspectRatio === "9:16" &&
    value.width === 1080 &&
    value.height === 1920 &&
    value.container === "mp4" &&
    typeof value.simulated === "boolean" &&
    (!hasOwn(value, "mediaUrl") || isSafeMediaUrl(value.mediaUrl, value.simulated)) &&
    (value.status !== "ready" || isSafeMediaUrl(value.mediaUrl, value.simulated))
  );
};

const isDestinationPreview = (value: unknown): boolean =>
  hasExactKeys(value, ["destinationId", "platform", "caption", "cta", "status"]) &&
  isNonEmptyString(value.destinationId) &&
  isOneOf(value.platform, DESTINATION_PLATFORMS) &&
  typeof value.caption === "string" &&
  isNonEmptyString(value.cta) &&
  value.status === "ready";

const isFitCheck = (value: unknown): boolean =>
  hasExactKeys(value, ["destinationId", "status", "checkedRevision", "failures"]) &&
  isNonEmptyString(value.destinationId) &&
  isOneOf(value.status, ["pending", "fits", "blocked"]) &&
  isIntegerAtLeast(value.checkedRevision, 1) &&
  isArrayOf(value.failures, isActionableFailure);

const isQueueItem = (value: unknown): boolean =>
  hasExactKeys(value, [
    "queueItemId",
    "relayId",
    "revision",
    "destinationId",
    "accountId",
    "platform",
    "status",
    "reviewRequired",
    "preview",
    "createdAt",
  ]) &&
  isNonEmptyString(value.queueItemId) &&
  isNonEmptyString(value.relayId) &&
  isIntegerAtLeast(value.revision, 1) &&
  isNonEmptyString(value.destinationId) &&
  isNonEmptyString(value.accountId) &&
  isOneOf(value.platform, DESTINATION_PLATFORMS) &&
  isOneOf(value.status, [
    "review_required",
    "approved",
    "publishing",
    "published",
    "failed",
    "unknown",
  ]) &&
  value.reviewRequired === true &&
  isDestinationPreview(value.preview) &&
  isNonEmptyString(value.createdAt);

const isApprovalState = (value: unknown): boolean => {
  if (!isObject(value) || !isOneOf(value.status, ["not_requested", "pending", "approved", "invalidated"])) {
    return false;
  }
  switch (value.status) {
    case "not_requested":
      return hasExactKeys(value, ["status", "revision"]) && isIntegerAtLeast(value.revision, 1);
    case "pending":
      return (
        hasExactKeys(value, ["status", "revision", "queueItemIds"]) &&
        isIntegerAtLeast(value.revision, 1) &&
        isStringArray(value.queueItemIds)
      );
    case "approved":
      return (
        hasExactKeys(value, [
          "status",
          "revision",
          "queueItemIds",
          "receiptId",
          "approvalToken",
          "approvedAt",
        ]) &&
        isIntegerAtLeast(value.revision, 1) &&
        isStringArray(value.queueItemIds) &&
        isNonEmptyString(value.receiptId) &&
        isNonEmptyString(value.approvalToken) &&
        isNonEmptyString(value.approvedAt)
      );
    case "invalidated":
      return (
        hasExactKeys(value, [
          "status",
          "revision",
          "invalidatedByRevision",
          "reason",
        ]) &&
        isIntegerAtLeast(value.revision, 1) &&
        isIntegerAtLeast(value.invalidatedByRevision, 1) &&
        isNonEmptyString(value.reason)
      );
  }
  return false;
};

const isLiveRelayView = (value: unknown): value is LiveRelayView => {
  if (
    !hasExactKeys(value, [
      "relayId",
      "revision",
      "revisionId",
      "phase",
      "event",
      "brief",
      "destinationIds",
      "jobs",
      "assets",
      "fitChecks",
      "queueItems",
      "approval",
      "failures",
      "createdAt",
      "updatedAt",
      "simulated",
    ])
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.relayId) &&
    isIntegerAtLeast(value.revision, 1) &&
    isNonEmptyString(value.revisionId) &&
    isOneOf(value.phase, [
      "generating",
      "blocked",
      "ready_for_review",
      "queued_for_review",
      "approved",
      "publishing",
      "published",
      "partial_failure",
      "failed",
    ]) &&
    isLiveEvent(value.event) &&
    isRelayBrief(value.brief) &&
    isStringArray(value.destinationIds) &&
    isArrayOf(value.jobs, isGenerationJob) &&
    hasExactKeys(value.assets, ["video", "previews"]) &&
    isVideoAsset(value.assets.video) &&
    isArrayOf(value.assets.previews, isDestinationPreview) &&
    isArrayOf(value.fitChecks, isFitCheck) &&
    isArrayOf(value.queueItems, isQueueItem) &&
    isApprovalState(value.approval) &&
    isArrayOf(value.failures, isActionableFailure) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.updatedAt) &&
    typeof value.simulated === "boolean"
  );
};

const isQueueLiveRelayData = (value: unknown): value is QueueLiveRelayData =>
  hasExactKeys(value, [
    "relayId",
    "revision",
    "queueItems",
    "failures",
    "approvalRequired",
  ]) &&
  isNonEmptyString(value.relayId) &&
  isIntegerAtLeast(value.revision, 1) &&
  isArrayOf(value.queueItems, isQueueItem) &&
  isArrayOf(value.failures, isActionableFailure) &&
  value.approvalRequired === true;

const isApprovalReceipt = (value: unknown): value is ApprovalReceipt =>
  hasExactKeys(value, [
    "receiptId",
    "approvalToken",
    "relayId",
    "revision",
    "queueItemIds",
    "approved",
    "approvedBy",
    "approvedAt",
  ]) &&
  isNonEmptyString(value.receiptId) &&
  isNonEmptyString(value.approvalToken) &&
  isNonEmptyString(value.relayId) &&
  isIntegerAtLeast(value.revision, 1) &&
  isStringArray(value.queueItemIds) &&
  value.approved === true &&
  isNonEmptyString(value.approvedBy) &&
  isNonEmptyString(value.approvedAt);

const isDelivery = (value: unknown): boolean => {
  if (
    !hasExactKeys(
      value,
      ["queueItemId", "destinationId", "platform", "status", "attempt", "simulated"],
      ["postId", "postUrl", "publishedAt", "failure"],
    )
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.queueItemId) &&
    isNonEmptyString(value.destinationId) &&
    isOneOf(value.platform, DESTINATION_PLATFORMS) &&
    isOneOf(value.status, ["pending_approval", "publishing", "published", "failed", "unknown"]) &&
    isIntegerAtLeast(value.attempt, 0) &&
    typeof value.simulated === "boolean" &&
    (!hasOwn(value, "postId") || isNonEmptyString(value.postId)) &&
    (!hasOwn(value, "postUrl") || isHttpsUrl(value.postUrl)) &&
    (!hasOwn(value, "publishedAt") || isNonEmptyString(value.publishedAt)) &&
    (!hasOwn(value, "failure") || isActionableFailure(value.failure)) &&
    (value.status !== "failed" || isActionableFailure(value.failure)) &&
    (value.status !== "published" ||
      isNonEmptyString(value.postId) ||
      isHttpsUrl(value.postUrl))
  );
};

const isStatusFields = (value: JsonObject): boolean =>
  isNonEmptyString(value.relayId) &&
  isIntegerAtLeast(value.revision, 1) &&
  isOneOf(value.overallStatus, [
    "pending_approval",
    "publishing",
    "published",
    "partial_failure",
    "failed",
    "unknown",
  ]) &&
  isArrayOf(value.deliveries, isDelivery) &&
  isNonEmptyString(value.updatedAt);

const isLiveRelayStatus = (value: unknown): value is LiveRelayStatus =>
  hasExactKeys(value, ["relayId", "revision", "overallStatus", "deliveries", "updatedAt"]) &&
  isStatusFields(value);

const isReleaseLiveRelayData = (value: unknown): value is ReleaseLiveRelayData =>
  hasExactKeys(value, [
    "relayId",
    "revision",
    "overallStatus",
    "deliveries",
    "updatedAt",
    "idempotencyKey",
    "replayed",
  ]) &&
  isStatusFields(value) &&
  isNonEmptyString(value.idempotencyKey) &&
  typeof value.replayed === "boolean";

const DATA_VALIDATORS: Record<HttpLiveRelayOperation, (value: unknown) => boolean> = {
  get_live_relay_context: isLiveRelayContext,
  find_active_live: isFindActiveLiveData,
  draft_live_relay: isLiveRelayView,
  get_live_relay: isLiveRelayView,
  revise_live_relay: isLiveRelayView,
  queue_live_relay: isQueueLiveRelayData,
  release_live_relay: isReleaseLiveRelayData,
  get_live_relay_status: isLiveRelayStatus,
  record_ui_approval: isApprovalReceipt,
};

const decodeOperationResult = <Operation extends HttpLiveRelayOperation>(
  operation: Operation,
  value: unknown,
): OperationResult<HttpOperationDataMap[Operation]> | undefined => {
  if (!isObject(value) || typeof value.ok !== "boolean") return undefined;
  if (value.ok) {
    if (!hasExactKeys(value, ["ok", "data"], ["warnings"])) return undefined;
    if (!DATA_VALIDATORS[operation](value.data)) return undefined;
    if (
      hasOwn(value, "warnings") &&
      !isArrayOf(value.warnings, isActionableFailure)
    ) {
      return undefined;
    }
    return value as unknown as OperationResult<HttpOperationDataMap[Operation]>;
  }
  if (!hasExactKeys(value, ["ok", "error"]) || !isActionableFailure(value.error)) {
    return undefined;
  }
  return value as unknown as OperationResult<HttpOperationDataMap[Operation]>;
};

const operationFailure = (
  code: "operation_cancelled" | "unknown_delivery_state",
  message: string,
  action: string,
  retryable: boolean,
  details?: Readonly<Record<string, string | number | boolean>>,
): OperationResult<never> => ({
  ok: false,
  error: {
    code,
    message,
    action,
    retryable,
    ...(details ? { details } : {}),
  },
});

const normalizeBasePath = (candidate: string | undefined): string => {
  const value = candidate ?? DEFAULT_LIVE_RELAY_HTTP_BASE_PATH;
  if (
    value.length === 0 ||
    value !== value.trim() ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new TypeError("basePath must be a root-relative same-origin path without query or fragment");
  }
  for (const segment of value.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new TypeError("basePath contains invalid percent encoding");
    }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) {
      throw new TypeError("basePath cannot contain traversal or encoded path separators");
    }
  }
  const normalized = value.replace(/\/+$/, "");
  return normalized || "/";
};

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return resolved;
};

/**
 * Same-origin production transport for Live Relay.
 *
 * This adapter never imports or constructs the deterministic provider. Network,
 * HTTP, content-type, size, JSON, and contract failures return a fail-closed
 * OperationFailure so a caller can display the outage without fabricating state.
 */
export class HttpLiveRelayProvider implements LiveRelayProvider {
  readonly #approvalEndpoint: string;
  readonly #operationEndpoint: string;
  readonly #fetcher: LiveRelayFetch;
  readonly #timeoutMs: number;
  readonly #maxResponseBytes: number;

  constructor(options: HttpLiveRelayProviderOptions = {}) {
    const basePath = normalizeBasePath(options.basePath);
    this.#operationEndpoint =
      basePath === "/"
        ? `/${LIVE_RELAY_HTTP_OPERATION_SEGMENT}`
        : `${basePath}/${LIVE_RELAY_HTTP_OPERATION_SEGMENT}`;
    this.#approvalEndpoint =
      basePath === "/"
        ? `/${LIVE_RELAY_HTTP_APPROVAL_SEGMENT}`
        : `${basePath}/${LIVE_RELAY_HTTP_APPROVAL_SEGMENT}`;
    const runtimeFetch = globalThis.fetch?.bind(globalThis) as LiveRelayFetch | undefined;
    this.#fetcher = options.fetcher ?? runtimeFetch ?? (() => {
      throw new TypeError("fetch is unavailable in this runtime");
    });
    this.#timeoutMs = boundedInteger(
      options.timeoutMs,
      DEFAULT_LIVE_RELAY_HTTP_TIMEOUT_MS,
      1,
      120_000,
      "timeoutMs",
    );
    this.#maxResponseBytes = boundedInteger(
      options.maxResponseBytes,
      DEFAULT_LIVE_RELAY_HTTP_MAX_RESPONSE_BYTES,
      1_024,
      8_388_608,
      "maxResponseBytes",
    );
  }

  getLiveRelayContext(
    input: GetLiveRelayContextInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayContext>> {
    return this.#request("get_live_relay_context", input, options);
  }

  findActiveLive(
    input: FindActiveLiveInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<FindActiveLiveData>> {
    return this.#request("find_active_live", input, options);
  }

  draftLiveRelay(
    input: DraftLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.#request("draft_live_relay", input, options);
  }

  getLiveRelay(
    input: GetLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.#request("get_live_relay", input, options);
  }

  reviseLiveRelay(
    input: ReviseLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.#request("revise_live_relay", input, options);
  }

  queueLiveRelay(
    input: QueueLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<QueueLiveRelayData>> {
    return this.#request("queue_live_relay", input, options);
  }

  releaseLiveRelay(
    input: ReleaseLiveRelayInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<ReleaseLiveRelayData>> {
    return this.#request("release_live_relay", input, options);
  }

  getLiveRelayStatus(
    input: GetLiveRelayStatusInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<LiveRelayStatus>> {
    return this.#request("get_live_relay_status", input, options);
  }

  recordUiApproval(
    input: RecordUiApprovalInput,
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<ApprovalReceipt>> {
    return this.#request("record_ui_approval", input, options);
  }

  async #request<Operation extends HttpLiveRelayOperation>(
    operation: Operation,
    input: HttpOperationInputMap[Operation],
    options?: LiveRelayProviderRequestOptions,
  ): Promise<OperationResult<HttpOperationDataMap[Operation]>> {
    const callerSignal = options?.signal;
    if (callerSignal?.aborted) {
      return operationFailure(
        "operation_cancelled",
        `The ${operation} request was cancelled before it started.`,
        "Retry the operation if it is still needed.",
        true,
      );
    }

    const requestController = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => requestController.abort(callerSignal?.reason);
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      requestController.abort(new Error("Live Relay request timed out"));
    }, this.#timeoutMs);

    try {
      const endpoint = operation === "record_ui_approval"
        ? this.#approvalEndpoint
        : this.#operationEndpoint;
      const response = await this.#fetcher(endpoint, {
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
        body: JSON.stringify({ operation, input }),
        signal: requestController.signal,
      });
      return await this.#decodeResponse(operation, response);
    } catch {
      if (callerSignal?.aborted) {
        return operationFailure(
          "operation_cancelled",
          `The ${operation} request was cancelled.`,
          "Retry the operation if it is still needed.",
          true,
        );
      }
      if (timedOut) {
        return operationFailure(
          "operation_cancelled",
          `The ${operation} request exceeded the ${this.#timeoutMs} ms timeout.`,
          "Check the connection and retry. The service did not report a completed operation.",
          true,
          { timeoutMs: this.#timeoutMs },
        );
      }
      return operationFailure(
        "unknown_delivery_state",
        `Sigmora could not reach the Live Relay service for ${operation}.`,
        "Check the connection and retry. Do not assume the operation completed.",
        true,
      );
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async #decodeResponse<Operation extends HttpLiveRelayOperation>(
    operation: Operation,
    response: Response,
  ): Promise<OperationResult<HttpOperationDataMap[Operation]>> {
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/(?:^|\s|;)application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(contentType)) {
      void response.body?.cancel();
      return operationFailure(
        "unknown_delivery_state",
        `The Live Relay service returned an unsupported response for ${operation}.`,
        "Retry once. If this continues, check the deployed operation endpoint.",
        false,
        { status: response.status },
      );
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.#maxResponseBytes) {
      void response.body?.cancel();
      return operationFailure(
        "unknown_delivery_state",
        `The Live Relay service response for ${operation} exceeded the safe size limit.`,
        "Inspect the deployed endpoint. Do not use this response as relay state.",
        false,
        { status: response.status, maxResponseBytes: this.#maxResponseBytes },
      );
    }

    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > this.#maxResponseBytes) {
      return operationFailure(
        "unknown_delivery_state",
        `The Live Relay service response for ${operation} exceeded the safe size limit.`,
        "Inspect the deployed endpoint. Do not use this response as relay state.",
        false,
        { status: response.status, maxResponseBytes: this.#maxResponseBytes },
      );
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body) as unknown;
    } catch {
      return operationFailure(
        "unknown_delivery_state",
        `The Live Relay service returned malformed JSON for ${operation}.`,
        "Retry once. If this continues, check the deployed operation endpoint.",
        false,
        { status: response.status },
      );
    }

    const result = decodeOperationResult(operation, decoded);
    if (!result || (!response.ok && result.ok)) {
      return operationFailure(
        "unknown_delivery_state",
        `The Live Relay service returned a response that does not match the ${operation} contract.`,
        "Inspect the deployed endpoint. Do not assume the operation completed.",
        false,
        { status: response.status },
      );
    }
    return result;
  }
}

export const createHttpLiveRelayProvider = (
  options: HttpLiveRelayProviderOptions = {},
): HttpLiveRelayProvider => new HttpLiveRelayProvider(options);
