# Devpost submission copy

## Project name

Sigmora Live Relay

## Tagline

Stay live while an agent builds, reviews, and verifies the launch moment with
you.

## Description

Going live is when creators most need cross-platform promotion—and when they
can least afford to leave the stream to edit, rewrite, upload, and check posts.
Sigmora Live Relay turns one selected live event into a reviewable 12-second
vertical campaign on a shared release board.

The page exposes eight narrow WebMCP tools. An agent reads the visible brand and
destination context, finds or declares the source live event, drafts the relay,
polls generation, revises copy, queues exact destination accounts, releases the
human-approved revision, and checks each destination independently. Every tool
call updates the same board the creator sees.

The consequential checkpoint remains human. Queue items are bound to exact
account IDs and one immutable revision. The creator reviews those items in the
UI and approves them there; approval is not exposed as a tool. Any revision
invalidates the receipt. Release requires that receipt plus an idempotency key,
and partial failure can never be reported as total success.

This is a strong WebMCP fit because the useful context and collaboration live
on the open page: current creative state, selected destinations, approval, and
receipts. Without WebMCP an agent must infer buttons and duplicate state.
With WebMCP it uses an explicit contract while the person keeps visual control.

The challenge implementation is framework-free TypeScript built around
`document.modelContext.registerTool(...)`, closed JSON Schemas, typed result
envelopes, an observable shared controller, page-scoped teardown, a strict HTTP
adapter, and a deterministic local provider. The normal manual interface works
when WebMCP is absent.

The public reference is intentionally simulated and says so throughout the UI
and tool results. It does not call social APIs or represent its receipt-like
URLs as real posts.

## Links

- Live app: <https://sigmora.org/en/webmcp-live-relay>
- Source: <https://github.com/mlsniperpro/sigmora-live-relay-webmcp>
- Demo video: <https://youtu.be/Lq48bUK2Kic>

## Judge walkthrough

1. Open the live app as a top-level page in ChatGPT's built-in browser, or in
   Chrome 149+ with WebMCP testing enabled.
2. Inspect Site tools and confirm the exact eight names listed in `README.md`.
3. Ask the agent to find the active reference live and create a high-energy
   relay with the CTA “Join before the reveal.”
4. Poll until the vertical preview is ready, revise the CTA, and queue the
   three exact displayed destinations.
5. Click **Approve exact posts** yourself in the visible board.
6. Ask the agent to release the approved revision and verify status.
7. Confirm three independently simulated results, repeat the release to see
   idempotent replay, then navigate away and confirm tool teardown.

## Local testing

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm dev
```
