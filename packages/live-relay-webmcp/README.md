# @sigmora/live-relay-webmcp

Framework-free TypeScript for Sigmora Live Relay's page-scoped WebMCP workflow. It contains the eight site-tool contracts and JSON Schemas, a shared controller for visible controls and agent calls, a deterministic in-memory provider, and feature-detected browser registration.

The package has no React or runtime dependencies and is safe to import in browser and Node ESM environments. Importing it in Node does not access `document`.

## Open-source boundary

This package is part of the separately extracted WebMCP Challenge project and
is licensed under the repository's MIT license. The license covers this
integration layer, adapter contracts, deterministic provider, and tests. It
does not cover the proprietary Sigmora product, hosted service, brand,
credentials, data model, publishers, generation engines, or infrastructure.
See the repository's `NOTICE.md` for the complete boundary.

## Tool surface

The closed surface contains exactly:

1. `get_live_relay_context`
2. `find_active_live`
3. `draft_live_relay`
4. `get_live_relay`
5. `revise_live_relay`
6. `queue_live_relay`
7. `release_live_relay`
8. `get_live_relay_status`

Every input object, including nested objects, rejects undeclared properties. Definitions include explicit read-only, destructive, and idempotency hints. `release_live_relay` is marked consequential/destructive and cannot run without `approved: true`, a visible-UI approval token bound to the current revision, the exact approved queue-item IDs, and an idempotency key.

Approval is intentionally not a ninth WebMCP tool. The person approves in the visible product through `controller.recordUiApproval(...)`; the resulting receipt is bound to the revision and exact accounts. Revising invalidates that approval.

## Basic use

```ts
import {
  createInMemoryLiveRelayProvider,
  createLiveRelayController,
  registerLiveRelayWebMcp,
} from "@sigmora/live-relay-webmcp";

const provider = createInMemoryLiveRelayProvider({
  workspace: { id: "ws_123", slug: "studio", name: "Studio" },
  brand: { id: "brand_123", name: "Studio", voice: "Direct and warm." },
  project: { id: "project_123", name: "Live launch" },
  // Supply an owned, playable 12-second 1080x1920 MP4 for the reference route.
  readyMediaUrl: "https://cdn.example.com/live-relay/announcement.mp4",
});

const controller = createLiveRelayController(provider);
const unsubscribe = controller.subscribe(({ snapshot }) => {
  renderVisibleBoard(snapshot);
});

const registration = await registerLiveRelayWebMcp({ controller });

// Run both when the Live Relay route unmounts. This route-scopes discovery.
await registration.teardown();
unsubscribe();
```

`registerLiveRelayWebMcp` checks for a top-level `document.modelContext.registerTool`. If WebMCP is unavailable, it returns `{ available: false }` and a no-op teardown; all typed controller methods continue to power the ordinary manual UI.

The current WebMCP draft unregisters imperative tools by aborting the `signal` supplied during registration. The returned teardown owns those signals and also supports an optional legacy `unregisterTool(name)` implementation. See the [official OpenAI Site Tools documentation](https://learn.chatgpt.com/docs/webmcp) and the [WebMCP draft](https://webmachinelearning.github.io/webmcp/).

## Production HTTP provider

Use the HTTP provider for a signed-in production board. It sends every one of
the eight operations to one root-relative, same-origin endpoint and sends the
visible, non-WebMCP approval action to a separate endpoint:

```ts
import {
  createHttpLiveRelayProvider,
  createLiveRelayController,
} from "@sigmora/live-relay-webmcp";

const provider = createHttpLiveRelayProvider({
  basePath: "/api/workspaces/my-workspace/live-relay",
  timeoutMs: 15_000,
});
const controller = createLiveRelayController(provider);
```

- The eight provider methods use `POST <basePath>/operations` with a body shaped
  as `{ operation, input }`.
- `recordUiApproval` uses `POST <basePath>/approval` with the same body shape.
- Requests always use `credentials: "same-origin"`, `mode: "same-origin"`,
  `cache: "no-store"`, and redirect rejection. Absolute or ambiguous base paths
  fail construction.
- Caller cancellation propagates through the controller to `fetch`; an internal
  timeout bounds requests that are never answered.
- Responses must be bounded JSON and match the operation's closed success or
  failure envelope. Malformed, oversized, wrong-content-type, and contradictory
  non-2xx responses fail closed as actionable errors.
- The adapter never imports, creates, or falls back to the deterministic
  provider. The server remains authoritative for session/workspace access,
  exact account ownership, credits, approval binding, idempotency, and receipts.

## Reference provider

The default provider is deterministic and visibly labels every receipt as simulated. It models:

- simulated verified authenticated-channel YouTube discovery and creator-declared YouTube/TikTok fallback;
- eligible and unavailable destinations without returning credentials;
- credit-consuming, versioned draft jobs and honest polling progress;
- a playable reference URL only after the 12-second 9:16 MP4 is ready;
- destination copy and media-fit checks;
- idempotent exact-account review queues;
- visible, revision-bound approval and stale-approval rejection;
- idempotent release with no duplicate simulated posts;
- independent per-destination publishing receipts and configurable partial failures.

Useful failure controls include `youtubeDiscovery`, `destinationAvailability`, `credits`, `mediaFitFailures`, `releaseFailures`, `generationPollsToReady`, and `statusPollsToTerminal`. The default is an original inline 12.000-second 1080x1920 H.264 reference clip, so the provider stays playable and self-contained; pass `readyMediaUrl` for the route's owned production or submission asset.

## Commands

From the monorepo root:

```sh
pnpm --filter @sigmora/live-relay-webmcp typecheck
pnpm --filter @sigmora/live-relay-webmcp test
pnpm --filter @sigmora/live-relay-webmcp build
```
