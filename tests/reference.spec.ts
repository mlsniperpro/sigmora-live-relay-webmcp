import { expect, test, type Page } from '@playwright/test';

const TOOL_NAMES = [
  'get_live_relay_context',
  'find_active_live',
  'draft_live_relay',
  'get_live_relay',
  'revise_live_relay',
  'queue_live_relay',
  'release_live_relay',
  'get_live_relay_status',
];

async function installHarness(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, { name: string; execute(input: unknown): Promise<unknown> }>();
    Object.defineProperty(window, '__webMcpTools', { configurable: true, value: tools });
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: { name: string; execute(input: unknown): Promise<unknown> }, options?: { signal?: AbortSignal }) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => {
            if (tools.get(tool.name) === tool) tools.delete(tool.name);
          }, { once: true });
        },
      },
    });
  });
}

async function callTool(page: Page, name: string, input: unknown) {
  return page.evaluate(async ({ name, input }) => {
    const tools = (window as unknown as { __webMcpTools: Map<string, { execute(value: unknown): Promise<unknown> }> }).__webMcpTools;
    return tools.get(name)!.execute(input);
  }, { name, input }) as Promise<{ ok: boolean; data: any }>;
}

test('registers exactly eight page-scoped tools and completes the reviewed workflow', async ({ page }) => {
  await installHarness(page);
  await page.goto('/');
  await expect(page.getByTestId('webmcp-status')).toHaveText('8/8 Site tools active');
  const names = await page.evaluate(() => [...(window as unknown as { __webMcpTools: Map<string, unknown> }).__webMcpTools.keys()]);
  expect(names).toEqual(TOOL_NAMES);

  const context = await callTool(page, 'get_live_relay_context', {});
  const live = await callTool(page, 'find_active_live', { mode: 'discover_youtube' });
  const draft = await callTool(page, 'draft_live_relay', {
    liveEventId: live.data.event.id,
    destinationIds: context.data.selectedDestinationIds,
    brief: { tone: 'high_energy', cta: 'Join the live now', durationSeconds: 12, aspectRatio: '9:16' },
  });
  await callTool(page, 'get_live_relay', { relayId: draft.data.relayId });
  const ready = await callTool(page, 'get_live_relay', { relayId: draft.data.relayId });
  const queue = await callTool(page, 'queue_live_relay', {
    relayId: ready.data.relayId,
    revision: ready.data.revision,
    destinationIds: context.data.selectedDestinationIds,
  });
  await page.getByTestId('approve-relay').click();
  const approved = await callTool(page, 'get_live_relay', { relayId: ready.data.relayId });
  const releaseInput = {
    relayId: ready.data.relayId,
    revision: ready.data.revision,
    queueItemIds: queue.data.queueItems.map((item: { queueItemId: string }) => item.queueItemId),
    approved: true,
    approvalToken: approved.data.approval.approvalToken,
    idempotencyKey: 'public-reference-release-r1',
  };
  const released = await callTool(page, 'release_live_relay', releaseInput);
  expect(released).toMatchObject({ ok: true, data: { overallStatus: 'publishing', replayed: false } });
  const replayed = await callTool(page, 'release_live_relay', releaseInput);
  expect(replayed).toMatchObject({ ok: true, data: { replayed: true } });
  await callTool(page, 'get_live_relay_status', { relayId: ready.data.relayId, revision: ready.data.revision });
  await callTool(page, 'get_live_relay_status', { relayId: ready.data.relayId, revision: ready.data.revision });
  await expect(page.getByTestId('overall-status')).toContainText('published');
  await expect(page.getByTestId('relay-provider-mode')).toHaveText('SIMULATED REFERENCE PROVIDER');
});

test('keeps the complete manual fallback usable without WebMCP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('webmcp-status')).toHaveText('Manual fallback active');
  await page.getByTestId('run-to-review').click();
  await expect(page.getByTestId('relay-preview').locator('video')).toBeVisible();
  await page.getByTestId('approve-relay').click();
  await page.getByTestId('release-relay').click();
  await page.getByTestId('refresh-status').click();
  await page.getByTestId('refresh-status').click();
  await expect(page.getByTestId('overall-status')).toContainText('published');
});
