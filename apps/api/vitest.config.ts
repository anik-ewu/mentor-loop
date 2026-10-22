import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://mentorloop:mentorloop@localhost:5432/mentorloop_test';

export default defineConfig({
  test: {
    globalSetup: './tests/globalSetup.ts',
    fileParallelism: false, // tests share one database
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters',
      DEMO_MODE: 'true',
      GOOGLE_CLIENT_ID: 'test-client-id',
    },
  },
});
