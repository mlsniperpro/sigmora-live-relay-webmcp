import type {
  ActionableFailure,
  ApprovalReceipt,
  ControllerExecuteOptions,
  DraftLiveRelayInput,
  FindActiveLiveData,
  FindActiveLiveInput,
  GetLiveRelayContextInput,
  GetLiveRelayInput,
  GetLiveRelayStatusInput,
  LiveRelayContext,
  LiveRelayControllerListener,
  LiveRelayControllerSnapshot,
  LiveRelayControllerUpdate,
  LiveRelayProvider,
  LiveRelayProviderRequestOptions,
  LiveRelayStatus,
  LiveRelayToolDataMap,
  LiveRelayToolInputMap,
  LiveRelayToolName,
  LiveRelayToolResultMap,
  LiveRelayView,
  OperationResult,
  QueueLiveRelayData,
  QueueLiveRelayInput,
  RecordUiApprovalInput,
  ReleaseLiveRelayData,
  ReleaseLiveRelayInput,
  ReviseLiveRelayInput,
} from "./contracts.js";
import { validateLiveRelayToolInput } from "./schemas.js";

const operationFailure = (
  code: "invalid_input" | "operation_cancelled",
  message: string,
  action: string,
): OperationResult<never> => ({
  ok: false,
  error: { code, message, action, retryable: code === "operation_cancelled" },
});

/** Shared orchestration boundary used by both visible manual controls and WebMCP handlers. */
export class LiveRelayController {
  readonly #provider: LiveRelayProvider;
  readonly #listeners = new Set<LiveRelayControllerListener>();
  #snapshot: LiveRelayControllerSnapshot = { sequence: 0 };

  constructor(provider: LiveRelayProvider) {
    this.#provider = provider;
  }

  getSnapshot(): LiveRelayControllerSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: LiveRelayControllerListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async execute<Name extends LiveRelayToolName>(
    name: Name,
    input: unknown,
    options: ControllerExecuteOptions = {},
  ): Promise<LiveRelayToolResultMap[Name]> {
    if (options.signal?.aborted) {
      const result = operationFailure(
        "operation_cancelled",
        `The ${name} invocation was cancelled before it started.`,
        "Retry the operation if it is still needed.",
      );
      this.#commit(name, options, result);
      return result as LiveRelayToolResultMap[Name];
    }

    const validation = validateLiveRelayToolInput(name, input);
    if (!validation.ok) {
      const result = operationFailure(
        "invalid_input",
        `Invalid ${name} input: ${validation.errors.join("; ")}`,
        "Use only the documented narrow input schema and exact IDs returned by this board.",
      );
      this.#commit(name, options, result);
      return result as LiveRelayToolResultMap[Name];
    }

    const result = await this.#dispatch(name, validation.value, options);
    this.#commit(name, options, result);
    return result as LiveRelayToolResultMap[Name];
  }

  getLiveRelayContext(
    input: GetLiveRelayContextInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayContext>> {
    return this.execute("get_live_relay_context", input, options);
  }

  findActiveLive(
    input: FindActiveLiveInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<FindActiveLiveData>> {
    return this.execute("find_active_live", input, options);
  }

  draftLiveRelay(
    input: DraftLiveRelayInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.execute("draft_live_relay", input, options);
  }

  getLiveRelay(
    input: GetLiveRelayInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.execute("get_live_relay", input, options);
  }

  reviseLiveRelay(
    input: ReviseLiveRelayInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayView>> {
    return this.execute("revise_live_relay", input, options);
  }

  queueLiveRelay(
    input: QueueLiveRelayInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<QueueLiveRelayData>> {
    return this.execute("queue_live_relay", input, options);
  }

  releaseLiveRelay(
    input: ReleaseLiveRelayInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<ReleaseLiveRelayData>> {
    return this.execute("release_live_relay", input, options);
  }

  getLiveRelayStatus(
    input: GetLiveRelayStatusInput,
    options?: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayStatus>> {
    return this.execute("get_live_relay_status", input, options);
  }

  async recordUiApproval(
    input: RecordUiApprovalInput,
    options: ControllerExecuteOptions = {},
  ): Promise<OperationResult<ApprovalReceipt>> {
    if (options.signal?.aborted) {
      const result = operationFailure(
        "operation_cancelled",
        "The visible approval operation was cancelled before it started.",
        "Review the current revision and approve it again if intended.",
      );
      this.#commit("record_ui_approval", options, result);
      return result;
    }
    const invalidApproval = this.#validateUiApproval(input);
    if (invalidApproval) {
      const result = operationFailure(
        "invalid_input",
        invalidApproval,
        "Approve a non-empty, unique set of exact queue IDs for the visible relay revision.",
      );
      this.#commit("record_ui_approval", options, result);
      return result;
    }
    const result = await this.#provider.recordUiApproval(
      input,
      this.#providerOptions(options),
    );
    this.#commit("record_ui_approval", options, result);
    return result;
  }

  async #dispatch<Name extends LiveRelayToolName>(
    name: Name,
    input: LiveRelayToolInputMap[Name],
    options: ControllerExecuteOptions,
  ): Promise<OperationResult<LiveRelayToolDataMap[Name]>> {
    const providerOptions = this.#providerOptions(options);
    switch (name) {
      case "get_live_relay_context":
        return this.#provider.getLiveRelayContext(
          input as GetLiveRelayContextInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "find_active_live":
        return this.#provider.findActiveLive(
          input as FindActiveLiveInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "draft_live_relay":
        return this.#provider.draftLiveRelay(
          input as DraftLiveRelayInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "get_live_relay":
        return this.#provider.getLiveRelay(
          input as GetLiveRelayInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "revise_live_relay":
        return this.#provider.reviseLiveRelay(
          input as ReviseLiveRelayInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "queue_live_relay":
        return this.#provider.queueLiveRelay(
          input as QueueLiveRelayInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "release_live_relay":
        return this.#provider.releaseLiveRelay(
          input as ReleaseLiveRelayInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
      case "get_live_relay_status":
        return this.#provider.getLiveRelayStatus(
          input as GetLiveRelayStatusInput,
          providerOptions,
        ) as Promise<OperationResult<LiveRelayToolDataMap[Name]>>;
    }
  }

  #providerOptions(
    options: ControllerExecuteOptions,
  ): LiveRelayProviderRequestOptions | undefined {
    return options.signal ? { signal: options.signal } : undefined;
  }

  #validateUiApproval(input: RecordUiApprovalInput): string | undefined {
    if (!input || typeof input !== "object") return "Approval input must be an object.";
    if (input.approved !== true) return "approved must be true.";
    if (!input.relayId || !Number.isInteger(input.revision) || input.revision < 1) {
      return "A relayId and positive integer revision are required.";
    }
    if (
      !Array.isArray(input.queueItemIds) ||
      input.queueItemIds.length === 0 ||
      input.queueItemIds.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(input.queueItemIds).size !== input.queueItemIds.length
    ) {
      return "queueItemIds must be a non-empty unique string array.";
    }
    return undefined;
  }

  #commit(
    operation: LiveRelayControllerUpdate["operation"],
    options: ControllerExecuteOptions,
    result: OperationResult<unknown>,
  ): void {
    const sequence = this.#snapshot.sequence + 1;
    let next: LiveRelayControllerSnapshot = { ...this.#snapshot, sequence };
    if (result.ok) {
      switch (operation) {
        case "get_live_relay_context":
          Object.assign(next, { context: result.data as LiveRelayContext });
          break;
        case "find_active_live":
          Object.assign(next, { selectedLive: (result.data as FindActiveLiveData).event });
          break;
        case "draft_live_relay":
        case "revise_live_relay": {
          const {
            queue: _staleQueue,
            approval: _staleApproval,
            status: _staleStatus,
            ...currentPage
          } = next;
          next = { ...currentPage, relay: result.data as LiveRelayView };
          break;
        }
        case "get_live_relay":
          Object.assign(next, { relay: result.data as LiveRelayView });
          break;
        case "queue_live_relay": {
          const { approval: _staleApproval, status: _staleStatus, ...currentPage } = next;
          next = { ...currentPage, queue: result.data as QueueLiveRelayData };
          break;
        }
        case "release_live_relay":
        case "get_live_relay_status":
          Object.assign(next, { status: result.data as LiveRelayStatus });
          break;
        case "record_ui_approval":
          Object.assign(next, { approval: result.data as ApprovalReceipt });
          break;
      }
    }
    this.#snapshot = next;
    const update: LiveRelayControllerUpdate = {
      sequence,
      source: options.source ?? "manual",
      operation,
      result,
      snapshot: next,
    };
    for (const listener of this.#listeners) {
      try {
        listener(update);
      } catch {
        // A rendering listener cannot change an already-completed domain operation.
      }
    }
  }
}

export const createLiveRelayController = (
  provider: LiveRelayProvider,
): LiveRelayController => new LiveRelayController(provider);

export const toActionableFailure = (error: unknown): ActionableFailure => ({
  code: "invalid_input",
  message: error instanceof Error ? error.message : "The Live Relay operation failed.",
  action: "Review the visible relay state and retry with the documented exact identifiers.",
  retryable: false,
});
