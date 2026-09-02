# New for WebMCP

Evidence date: 2026-09-02  
Challenge period: 2026-08-25 through 2026-09-03

## Competition-period work

Sigmora existed before the challenge. The following integration was created
during the challenge period:

- a framework-free `@sigmora/live-relay-webmcp` package;
- exactly eight top-level imperative `document.modelContext.registerTool(...)`
  registrations;
- closed JSON input schemas and typed verifiable results;
- a shared controller used by WebMCP and normal UI controls;
- deterministic, versioned relay state with generation progress;
- exact-account queue items that always require review;
- visible revision- and queue-set-bound human approval;
- stale-approval rejection and idempotent release;
- independent published, failed, pending, and unknown destination outcomes;
- an unmistakably simulated local/reference provider;
- a bounded same-origin HTTP provider that fails closed without a production
  adapter; and
- unit, browser, safety, teardown, and manual-fallback tests.

## Dated evidence

- Original challenge integration commit in the private product repository:
  `acb74d70cd611dcc53d7d4dda321945b205c4f4f`, authored and committed
  2026-08-30 19:56:03 EAT.
- History-preserving public extraction commit:
  `b33a9e9`, authored 2026-08-30 19:56:03 EAT.
- Public extraction, standalone app, license, evidence, and submission package:
  the current `main` commit, authored and committed 2026-09-02.

The live reference is <https://sigmora.org/en/webmcp-live-relay>. The separately
licensed source repository is
<https://github.com/mlsniperpro/sigmora-live-relay-webmcp>.

On 2026-09-02 the deployed page was opened in Chrome 152 with WebMCP enabled.
The native `document.modelContext.registerTool` API was available and the page
reported `8/8 Site tools active`; evidence is stored at
`docs/screenshots/webmcp-registration.png`. The independent local browser suite
also completed the reviewed tool workflow, idempotent replay, visible terminal
state, and non-WebMCP manual fallback.

## Pre-existing foundation

The proprietary Sigmora product, remote MCP service, workspaces, generation
systems, connected accounts, payment rails, queues, social publishers,
infrastructure, and customer data predate the challenge and are not presented
as new WebMCP work. They are not included in this repository or licensed by it.

## Truthful evidence boundary

The public reference provider does not use external credentials, call social
networks, spend credits, prove a real broadcast, or create real posts. Every
reference asset and delivery is marked `simulated: true`. The demo and
submission must describe those results as simulated.
