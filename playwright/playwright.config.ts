import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for testing Storybook components.
 * Tests verify accessibility, functionality, and visual consistency
 * across Chromium, Firefox, and WebKit.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 2,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Build Storybook fresh and serve the prebuilt static bundle. Building on
  // every run guarantees the latest stories are included; serving static files
  // (no Vite lazy-compile) eliminates the "sb-show-preparing-story" render
  // races that made the dev server flaky under full-suite parallel load.
  webServer: {
    command: 'pnpm --filter storybook run build && pnpm --filter storybook exec http-server ../storybook/storybook-static -p 6006 -s',
    url: 'http://localhost:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
    cwd: '.',
  },
});
