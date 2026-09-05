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

  // Serve Storybook for tests.
  // Use `pnpm --filter storybook run dev` to start the dev server from the storybook package.
  // The cwd: '..' runs commands from the workspace root, where pnpm can reach the storybook package.
  webServer: {
    command: 'pnpm --filter storybook run dev',
    url: 'http://localhost:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    cwd: '..',
  },
});
