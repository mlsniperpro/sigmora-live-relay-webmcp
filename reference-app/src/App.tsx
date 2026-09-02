import { LiveRelayBoard } from './components/live-relay-board';

export function App() {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Sigmora Live Relay home">
          <img src="/logo.webp" alt="" width="38" height="38" />
          <span>Sigmora Live Relay</span>
        </a>
        <a href="https://sigmora.org" rel="noreferrer">Sigmora product ↗</a>
      </header>
      <main id="top">
        <section className="hero">
          <p className="eyebrow">Built for the OpenAI WebMCP Challenge</p>
          <h1>Stay live. Launch the moment everywhere.</h1>
          <p className="summary">
            One broadcast becomes a reviewed 12-second campaign. The agent coordinates the
            workflow; the creator keeps the consequential approval.
          </p>
          <div className="facts" aria-label="Reference application facts">
            <span>8 page-scoped tools</span>
            <span>1 shared UI + agent state machine</span>
            <span>0 autonomous approvals</span>
          </div>
        </section>
        <div className="board-wrap">
          <LiveRelayBoard surface="reference" />
        </div>
        <section className="disclosure">
          <strong>Truthful reference boundary</strong>
          <p>
            This public application uses a deterministic simulated provider. It does not call
            social APIs or create real posts. Receipt-like results remain visibly marked simulated.
          </p>
        </section>
      </main>
      <footer>
        <span>Open-source WebMCP integration</span>
        <a href="https://github.com/mlsniperpro/sigmora-live-relay-webmcp">Source code</a>
      </footer>
    </>
  );
}
