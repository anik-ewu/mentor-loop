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

describe('Claude call usage', () => {
  const message = (stop_reason: string, parsed_output: unknown) =>
    ({
      stop_reason,
      parsed_output,
      usage: { input_tokens: 2_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0 },
    }) as never;

  it('prices the tokens a call used (defaults: $0.10 in, $0.50 out per million)', async () => {
    parse.mockResolvedValueOnce(message('end_turn', {}));
    expect((await call()).usage).toEqual({
      inputTokens: 2_000_000,
      outputTokens: 1_000_000,
      costMicros: 700_000,
    });
  });

  it('keeps the usage on a failure after the model answered', async () => {
    parse.mockResolvedValueOnce(message('max_tokens', null));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(AiFailure);
    expect(err.usage.costMicros).toBe(700_000);
  });
});
