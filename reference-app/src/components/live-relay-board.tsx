'use client';

import {
  Check,
  CircleAlert,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Radio,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import {
  createInMemoryLiveRelayProvider,
  createLiveRelayController,
  HttpLiveRelayProvider,
  LIVE_RELAY_TOOL_NAMES,
  registerLiveRelayWebMcp,
  type LiveRelayControllerUpdate,
  type LiveRelayDelivery,
  type OperationResult,
} from '@sigmora/live-relay-webmcp';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { authedFetch } from '../lib/authed-fetch';
import styles from './live-relay-board.module.css';

type LiveRelayBoardProps = {
  surface: 'reference' | 'workspace';
  workspace?: {
    id: string;
    slug: string;
    name: string;
  };
};

type RegistrationState = {
  checked: boolean;
  available: boolean;
  count: number;
};

type ActivityEntry = {
  id: number;
  operation: LiveRelayControllerUpdate['operation'];
  source: LiveRelayControllerUpdate['source'];
  ok: boolean;
};

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube Shorts',
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  x: 'X',
};

const PLATFORM_MARKS: Record<string, string> = {
  youtube: 'YT',
  tiktok: 'TT',
  instagram: 'IG',
  x: 'X',
};

function readableOperation(operation: string) {
  return operation.replaceAll('_', ' ');
}

function operationError(result: OperationResult<unknown>) {
  return result.ok ? null : `${result.error.message} ${result.error.action}`;
}

function deliveryFor(
  deliveries: readonly LiveRelayDelivery[] | undefined,
  destinationId: string,
) {
  return deliveries?.find((delivery) => delivery.destinationId === destinationId);
}

function stateLabel(state: string) {
  return state.replaceAll('_', ' ');
}

export function LiveRelayBoard({ surface, workspace }: LiveRelayBoardProps) {
  const [controller] = useState(() => {
    if (surface === 'workspace') {
      if (!workspace) {
        throw new Error('A workspace is required for the production Live Relay surface.');
      }

      return createLiveRelayController(
        new HttpLiveRelayProvider({
          basePath: `/api/workspaces/${encodeURIComponent(workspace.slug)}/live-relay`,
          fetcher: authedFetch,
        }),
      );
    }

    const referenceWorkspace = {
      id: 'workspace-webmcp-reference',
      slug: 'webmcp-reference',
      name: 'Sigmora WebMCP showcase',
    };

    return createLiveRelayController(
      createInMemoryLiveRelayProvider({
        workspace: referenceWorkspace,
        brand: {
          id: 'brand-sigmora-live',
          name: 'Sigmora',
          voice: 'Precise, energetic, proof-first',
        },
        project: {
          id: 'project-live-relay-launch',
          name: 'Live Relay launch',
        },
        generationPollsToReady: 2,
        statusPollsToTerminal: 2,
        readyMediaUrl: '/webmcp/live-relay-reference.mp4#t=0,12',
      }),
    );
  });

  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(() => listener()),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.getSnapshot(), [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const previewMediaUrl = snapshot.relay?.assets.video.mediaUrl;

  const [registration, setRegistration] = useState<RegistrationState>({
    checked: false,
    available: false,
    count: 0,
  });
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contextRequested = useRef(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return controller.subscribe((update) => {
      setActivity((current) => [
        {
          id: update.sequence,
          operation: update.operation,
          source: update.source,
          ok: update.result.ok,
        },
        ...current.filter((entry) => entry.id !== update.sequence),
      ].slice(0, 8));
    });
  }, [controller]);

  useEffect(() => {
    let disposed = false;
    let teardown: (() => Promise<void>) | undefined;

    void registerLiveRelayWebMcp({ controller }).then((result) => {
      teardown = result.teardown;
      if (disposed) {
        void result.teardown();
        return;
      }
      setRegistration({
        checked: true,
        available: result.available,
        count: result.registeredToolNames.length,
      });
    });

    return () => {
      disposed = true;
      if (teardown) void teardown();
    };
  }, [controller]);

  useEffect(() => {
    if (contextRequested.current || controller.getSnapshot().context) return;
    contextRequested.current = true;
    let disposed = false;
    void controller.getLiveRelayContext({}, { source: 'manual' })
      .then((result) => {
        if (disposed) return;
        const nextError = operationError(result);
        if (nextError) setError(nextError);
      })
      .catch((caught: unknown) => {
        if (disposed) return;
        setError(caught instanceof Error
          ? caught.message
          : 'The Sigmora production provider could not load Live Relay context.');
      });
    return () => {
      disposed = true;
    };
  }, [controller]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || typeof window.matchMedia !== 'function') return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPlaybackPreference = () => {
      if (reducedMotion.matches) {
        preview.pause();
        return;
      }
      void preview.play().catch(() => {
        // Browser autoplay policy may still require a direct user gesture.
        // Native controls remain available in that case.
      });
    };

    syncPlaybackPreference();
    reducedMotion.addEventListener('change', syncPlaybackPreference);
    return () => reducedMotion.removeEventListener('change', syncPlaybackPreference);
  }, [previewMediaUrl]);

  const run = useCallback(async (
    label: string,
    operation: () => Promise<OperationResult<unknown>>,
  ) => {
    setBusy(label);
    setError(null);
    try {
      const result = await operation();
      const nextError = operationError(result);
      if (nextError) setError(nextError);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The operation could not be completed.';
      setError(message);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const findLive = useCallback(() => run('find', () =>
    controller.findActiveLive({ mode: 'discover_youtube' }, { source: 'manual' })),
  [controller, run]);

  const draftRelay = useCallback(() => run('draft', async () => {
    const current = controller.getSnapshot();
    const context = current.context;
    const selectedLive = current.selectedLive;
    if (!context || !selectedLive) {
      return {
        ok: false as const,
        error: {
          code: 'live_event_not_found' as const,
          message: 'Select an active live event first.',
          action: 'Use Find active live, then draft the relay.',
          retryable: true,
        },
      };
    }
    return controller.draftLiveRelay({
      liveEventId: selectedLive.id,
      destinationIds: context.selectedDestinationIds,
      brief: {
        tone: 'high_energy',
        cta: 'Join the live now',
        durationSeconds: 12,
        aspectRatio: '9:16',
      },
    }, { source: 'manual' });
  }), [controller, run]);

  const refreshRelay = useCallback(() => run('refresh', async () => {
    const relay = controller.getSnapshot().relay;
    if (!relay) {
      return {
        ok: false as const,
        error: {
          code: 'relay_not_found' as const,
          message: 'There is no relay to refresh.',
          action: 'Draft the relay first.',
          retryable: true,
        },
      };
    }
    return controller.getLiveRelay({ relayId: relay.relayId }, { source: 'manual' });
  }), [controller, run]);

  const reviseRelay = useCallback(() => run('revise', async () => {
    const relay = controller.getSnapshot().relay;
    if (!relay) {
      return {
        ok: false as const,
        error: {
          code: 'relay_not_found' as const,
          message: 'There is no relay to revise.',
          action: 'Draft the relay first.',
          retryable: true,
        },
      };
    }
    return controller.reviseLiveRelay({
      relayId: relay.relayId,
      baseRevision: relay.revision,
      changes: {
        tone: relay.revision % 2 === 0 ? 'high_energy' : 'urgent',
        cta: relay.revision % 2 === 0 ? 'Join the live now' : 'Catch the proof live',
        captions: relay.destinationIds
          .filter((destinationId) => destinationId.includes('x'))
          .map((destinationId) => ({
            destinationId,
            caption: 'The result is happening live. Watch the proof, then build yours. →',
          })),
      },
    }, { source: 'manual' });
  }), [controller, run]);

  const queueRelay = useCallback(() => run('queue', async () => {
    const relay = controller.getSnapshot().relay;
    if (!relay) {
      return {
        ok: false as const,
        error: {
          code: 'relay_not_found' as const,
          message: 'There is no relay to queue.',
          action: 'Draft and finish the relay first.',
          retryable: true,
        },
      };
    }
    return controller.queueLiveRelay({
      relayId: relay.relayId,
      revision: relay.revision,
      destinationIds: relay.destinationIds,
    }, { source: 'manual' });
  }), [controller, run]);

  const approveRelay = useCallback(() => run('approve', async () => {
    const current = controller.getSnapshot();
    const relay = current.relay;
    const queue = current.queue;
    if (!relay || !queue) {
      return {
        ok: false as const,
        error: {
          code: 'approval_required' as const,
          message: 'Queue exact destinations before approval.',
          action: 'Use Queue for review first.',
          retryable: true,
        },
      };
    }
    return controller.recordUiApproval({
      relayId: relay.relayId,
      revision: relay.revision,
      queueItemIds: queue.queueItems.map((item) => item.queueItemId),
      approved: true,
      approvedBy: 'Creator in Sigmora UI',
    }, { source: 'manual' });
  }), [controller, run]);

  const releaseRelay = useCallback(() => run('release', async () => {
    const current = controller.getSnapshot();
    const relay = current.relay;
    const queue = current.queue;
    const approval = current.approval;
    if (!relay || !queue || !approval) {
      return {
        ok: false as const,
        error: {
          code: 'approval_required' as const,
          message: 'A current human approval receipt is required.',
          action: 'Review every destination and select Approve exact posts.',
          retryable: true,
        },
      };
    }
    return controller.releaseLiveRelay({
      relayId: relay.relayId,
      revision: relay.revision,
      queueItemIds: queue.queueItems.map((item) => item.queueItemId),
      approved: true,
      approvalToken: approval.approvalToken,
      idempotencyKey: `release-${relay.relayId}-r${relay.revision}`,
    }, { source: 'manual' });
  }), [controller, run]);

  const refreshStatus = useCallback(() => run('status', async () => {
    const relay = controller.getSnapshot().relay;
    if (!relay) {
      return {
        ok: false as const,
        error: {
          code: 'relay_not_found' as const,
          message: 'There is no relay to verify.',
          action: 'Draft and release the relay first.',
          retryable: true,
        },
      };
    }
    return controller.getLiveRelayStatus({
      relayId: relay.relayId,
      revision: relay.revision,
    }, { source: 'manual' });
  }), [controller, run]);

  const runToReview = useCallback(() => run('run-to-review', async () => {
    let current = controller.getSnapshot();
    if (!current.context) {
      const context = await controller.getLiveRelayContext({}, { source: 'manual' });
      if (!context.ok) return context;
    }
    current = controller.getSnapshot();
    if (!current.selectedLive) {
      const live = await controller.findActiveLive(
        { mode: 'discover_youtube' },
        { source: 'manual' },
      );
      if (!live.ok) return live;
    }
    current = controller.getSnapshot();
    if (!current.relay) {
      const context = current.context!;
      const drafted = await controller.draftLiveRelay({
        liveEventId: current.selectedLive!.id,
        destinationIds: context.selectedDestinationIds,
        brief: {
          tone: 'high_energy',
          cta: 'Join the live now',
          durationSeconds: 12,
          aspectRatio: '9:16',
        },
      }, { source: 'manual' });
      if (!drafted.ok) return drafted;
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      current = controller.getSnapshot();
      if (current.relay?.assets.video.status === 'ready') break;
      const refreshed = await controller.getLiveRelay(
        { relayId: current.relay!.relayId },
        { source: 'manual' },
      );
      if (!refreshed.ok) return refreshed;
    }
    current = controller.getSnapshot();
    if (!current.queue) {
      return controller.queueLiveRelay({
        relayId: current.relay!.relayId,
        revision: current.relay!.revision,
        destinationIds: current.relay!.destinationIds,
      }, { source: 'manual' });
    }
    return { ok: true as const, data: current.queue };
  }), [controller, run]);

  const context = snapshot.context;
  const relay = snapshot.relay;
  const queue = snapshot.queue;
  const approval = snapshot.approval;
  const status = snapshot.status;
  const isReady = relay?.assets.video.status === 'ready';
  const destinations = context?.eligibleDestinations.filter((destination) =>
    context.selectedDestinationIds.includes(destination.destinationId)) ?? [];
  const webMcpLabel = registration.available
    ? `${registration.count}/${LIVE_RELAY_TOOL_NAMES.length} Site tools active`
    : registration.checked
      ? 'Manual fallback active'
      : 'Checking Site tools…';
  const providerFailedClosed = surface === 'workspace' && Boolean(error);
  const providerLabel = surface === 'reference'
    ? 'SIMULATED REFERENCE PROVIDER'
    : providerFailedClosed
      ? 'SIGMORA PRODUCTION PROVIDER · FAIL-CLOSED'
      : context?.simulation.label ?? 'SIGMORA PRODUCTION PROVIDER · CONNECTING';

  return (
    <section
      className={styles.board}
      data-testid="live-relay-board"
      aria-label="Sigmora Live Relay launch room"
      aria-busy={Boolean(busy)}
    >
      <header className={styles.boardHeader}>
        <div className={styles.boardIdentity}>
          <img
            src="/logo.webp"
            alt=""
            width={52}
            height={52}
            className={styles.boardLogo}
            data-testid="sigmora-relay-logo"
          />
          <div>
            <div className={styles.eyebrow}><Radio size={14} /> Sigmora live launch room</div>
            <h2>Sigmora Live Relay</h2>
            <p>One active live. One vertical promo. Exact-account approval before anything leaves Sigmora.</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => void runToReview()}
            disabled={Boolean(busy) || Boolean(queue)}
            data-testid="run-to-review"
          >
            {busy === 'run-to-review' ? <LoaderCircle className={styles.spin} size={16} /> : <WandSparkles size={16} />}
            Build to review
          </button>
          <div
            className={`${styles.toolBadge} ${registration.available ? styles.toolBadgeActive : ''}`}
            data-testid="webmcp-status"
            role="status"
          >
            <span className={styles.pulse} />
            {webMcpLabel}
          </div>
        </div>
      </header>

      <div className={styles.safetyStrip}>
        <span><ShieldCheck size={15} /> Human checkpoint enforced</span>
        <span>{surface === 'reference' ? 'Public reference route' : context?.workspace.name ?? 'Workspace route'}</span>
        <span
          className={`${styles.simulationLabel} ${providerFailedClosed ? styles.providerFailedClosed : ''}`}
          data-testid="relay-provider-mode"
          data-provider-state={providerFailedClosed ? 'fail-closed' : 'available'}
        >
          {providerLabel}
        </span>
      </div>

      {error ? (
        <div className={styles.errorBanner} role="alert" data-testid="relay-error">
          <CircleAlert size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.step}>01</span>
              <h3>Live source</h3>
            </div>
            <span className={snapshot.selectedLive ? styles.readyDot : styles.waitingDot} />
          </div>

          {snapshot.selectedLive ? (
            <div className={styles.liveCard} data-testid="selected-live">
              <div className={styles.liveThumb}>
                <span className={styles.livePill}>LIVE</span>
                <Radio size={28} />
              </div>
              <div>
                <strong>{snapshot.selectedLive.title}</strong>
                <p>{snapshot.selectedLive.channelName ?? 'Sigmora Creator Lab'}</p>
                <span>{snapshot.selectedLive.verified
                  ? surface === 'reference'
                    ? 'Simulated verified YouTube scenario'
                    : 'Verified through the connected production account'
                  : 'Creator-declared event'}</span>
              </div>
            </div>
          ) : (
            <div className={styles.emptySource}>
              <Radio size={30} />
              <strong>Find what is live now</strong>
              <p>{surface === 'reference'
                ? 'This public scenario simulates a verified active broadcast; production checks the signed-in creator’s connected account.'
                : 'The tool checks the signed-in creator’s active broadcast; a declared event is the explicit fallback.'}</p>
            </div>
          )}

          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => void findLive()}
            disabled={Boolean(busy) || Boolean(snapshot.selectedLive)}
            data-testid="find-live"
          >
            {busy === 'find' ? <LoaderCircle className={styles.spin} size={16} /> : <Radio size={16} />}
            Find active live
          </button>

          <div className={styles.contextBlock}>
            <span>Brand context</span>
            <strong>{context?.brand.name ?? 'Loading…'}</strong>
            <p>{context?.brand.voice ?? 'Reading the page-owned brand and destination context.'}</p>
          </div>

          <div className={styles.toolList} aria-label="Registered Site tools">
            {LIVE_RELAY_TOOL_NAMES.slice(0, 4).map((name) => (
              <code key={name}>{name}</code>
            ))}
          </div>
        </article>

        <article className={`${styles.panel} ${styles.previewPanel}`}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.step}>02</span>
              <h3>12-second creative</h3>
            </div>
            <span className={styles.revision}>R{relay?.revision ?? '—'}</span>
          </div>

          <div className={styles.phone} data-testid="relay-preview">
            <div className={styles.phoneTop}><span /><span /></div>
            {isReady && relay?.assets.video.mediaUrl ? (
              <video
                key={relay.assets.video.mediaUrl}
                ref={previewRef}
                className={styles.video}
                src={relay.assets.video.mediaUrl}
                muted
                loop
                controls
                playsInline
                preload="metadata"
                aria-label="Generated 12-second vertical relay preview"
              />
            ) : (
              <div className={styles.rendering}>
                {relay ? <LoaderCircle className={styles.spin} size={32} /> : <Sparkles size={32} />}
                <strong>{relay ? `${relay.jobs[0]?.progress ?? 0}% rendering` : 'Creative appears here'}</strong>
                <span>9:16 · 1080×1920 · MP4</span>
              </div>
            )}
            <div className={styles.videoOverlay}>
              <span>LIVE → CLIP</span>
              <strong>{relay?.brief.cta ?? 'Join the live now'}</strong>
              <small>12 SEC · VERTICAL</small>
            </div>
          </div>

          <div className={styles.assetFacts}>
            <span><Check size={14} /> 9:16 fit</span>
            <span><Check size={14} /> 12 seconds</span>
            <span><Check size={14} /> {surface === 'reference' ? 'local reference asset' : 'production render'}</span>
          </div>

          <div className={styles.actionRow}>
            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void draftRelay()}
              disabled={Boolean(busy) || !snapshot.selectedLive || Boolean(relay)}
              data-testid="draft-relay"
            >
              <Sparkles size={16} /> Draft relay
            </button>
            <button
              className={styles.iconButton}
              type="button"
              title="Refresh render status"
              aria-label="Refresh render status"
              onClick={() => void refreshRelay()}
              disabled={Boolean(busy) || !relay || isReady}
              data-testid="refresh-relay"
            >
              <RefreshCw className={busy === 'refresh' ? styles.spin : ''} size={17} />
            </button>
            <button
              className={styles.iconButton}
              type="button"
              title="Revise CTA and invalidate prior approval"
              aria-label="Revise CTA"
              onClick={() => void reviseRelay()}
              disabled={Boolean(busy) || !relay || !isReady}
              data-testid="revise-relay"
            >
              <WandSparkles size={17} />
            </button>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.step}>03</span>
              <h3>Exact destinations</h3>
            </div>
            <span className={styles.destinationCount}>{destinations.length}</span>
          </div>

          <div className={styles.destinationList} data-testid="destination-list">
            {destinations.map((destination) => {
              const delivery = deliveryFor(status?.deliveries, destination.destinationId);
              const queueItem = queue?.queueItems.find((item) => item.destinationId === destination.destinationId);
              const state = delivery?.status ?? queueItem?.status ?? (isReady ? 'ready for review' : 'waiting for creative');
              return (
                <div className={styles.destination} key={destination.destinationId}>
                  <span className={styles.platformMark}>{PLATFORM_MARKS[destination.platform] ?? '?'}</span>
                  <div>
                    <strong>{PLATFORM_LABELS[destination.platform] ?? destination.platform}</strong>
                    <span>{destination.handle}</span>
                  </div>
                  <div className={`${styles.destinationState} ${styles[`state_${delivery?.status ?? queueItem?.status ?? 'waiting'}`] ?? ''}`}>
                    {delivery?.status === 'published' ? <Check size={12} /> : <Clock3 size={12} />}
                    {stateLabel(state)}
                  </div>
                  {delivery?.postUrl ? (
                    <a href={delivery.postUrl} target="_blank" rel="noreferrer" aria-label={`Open ${destination.platform} receipt`}>
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className={styles.releaseStack}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => void queueRelay()}
              disabled={Boolean(busy) || !isReady || Boolean(queue)}
              data-testid="queue-relay"
            >
              <ShieldCheck size={16} /> Queue for review
            </button>
            <button
              className={styles.approveButton}
              type="button"
              onClick={() => void approveRelay()}
              disabled={Boolean(busy) || !queue || Boolean(approval)}
              data-testid="approve-relay"
            >
              <Check size={16} /> Approve exact posts
            </button>
            <button
              className={styles.releaseButton}
              type="button"
              onClick={() => void releaseRelay()}
              disabled={Boolean(busy) || !approval || Boolean(status)}
              data-testid="release-relay"
            >
              {busy === 'release' ? <LoaderCircle className={styles.spin} size={16} /> : <Rocket size={16} />}
              Release approved revision
            </button>
            <button
              className={styles.textButton}
              type="button"
              onClick={() => void refreshStatus()}
              disabled={Boolean(busy) || !status || status.overallStatus === 'published'}
              data-testid="refresh-status"
            >
              <RefreshCw className={busy === 'status' ? styles.spin : ''} size={14} /> Verify receipts
            </button>
          </div>

          <p className={styles.approvalNote} data-testid="approval-state">
            <ShieldCheck size={14} />
            {approval
              ? `Human approval ${approval.receiptId} is bound to revision ${approval.revision}.`
              : queue
                ? `Revision ${queue.revision} is locked for review. A tool cannot approve it.`
                : 'Every destination remains review-required until a person approves in this UI.'}
          </p>
        </article>
      </div>

      <footer className={styles.activityBar}>
        <div className={styles.activityTitle}>
          <span className={styles.pulse} />
          <div><strong>Agent activity</strong><span>Every tool call updates this board</span></div>
        </div>
        <div
          className={styles.activityFeed}
          data-testid="activity-feed"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {activity.length ? activity.slice(0, 4).map((entry) => (
            <span key={entry.id} className={entry.ok ? styles.activityOk : styles.activityFailed}>
              {entry.ok ? <Check size={12} /> : <CircleAlert size={12} />}
              {readableOperation(entry.operation)}
              <small>{entry.source}</small>
            </span>
          )) : <span className={styles.activityIdle}>Waiting for the first action…</span>}
        </div>
        <div className={styles.overallStatus} data-testid="overall-status" role="status">
          <span>Relay status</span>
          <strong>{stateLabel(status?.overallStatus ?? relay?.phase ?? 'not started')}</strong>
        </div>
      </footer>
    </section>
  );
}
