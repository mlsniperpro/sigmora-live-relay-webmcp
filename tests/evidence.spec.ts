import { expect, test } from '@playwright/test';

test('capture the reviewed simulated release board', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByTestId('run-to-review').click();
  await expect(page.getByTestId('relay-preview').locator('video')).toBeVisible();
  await page.getByTestId('approve-relay').click();
  await page.getByTestId('release-relay').click();
  await page.getByTestId('refresh-status').click();
  await page.getByTestId('refresh-status').click();
  await expect(page.getByTestId('overall-status')).toContainText('published');
  await page.screenshot({
    path: 'docs/screenshots/live-relay-published.png',
    fullPage: true,
  });
});
