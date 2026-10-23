import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiFailure, callStructured } from '../src/modules/ai/claude';

const parse = vi.spyOn(Anthropic.Messages.prototype, 'parse');
// The failures are logged on purpose; keep the test output clean.
vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  parse.mockReset();
});

const call = () =>
  callStructured({ system: 's', content: [{ type: 'text', text: 'x' }], schema: z.object({}) });

const apiError = (status: number) =>
  Anthropic.APIError.generate(
    status,
    { type: 'error', error: { message: 'nope' } },
    'nope',
    new Headers(),
  );

describe('Claude call errors', () => {
  it.each([401, 403, 404])('reports a %i as a setup problem, not "try again"', async (status) => {
    parse.mockRejectedValueOnce(apiError(status));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(AiFailure);
    expect(err.message).toMatch(/isn't set up correctly/);
  });

  it('keeps rate limits retryable', async () => {
    parse.mockRejectedValueOnce(apiError(429));
    expect((await call().catch((e) => e)).message).toMatch(/busy right now/);
  });
});
