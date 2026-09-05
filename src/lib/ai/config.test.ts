import { afterEach, describe, expect, it } from 'vitest';
import { aiConfig } from '@/lib/env';

/**
 * Provider selection, which is the setting most likely to be wrong and least
 * likely to announce it: a model name sent to the wrong provider is a 404 at
 * request time, long after the setting that caused it.
 */
// Every AI_* variable aiConfig() reads. withEnv() clears the whole list before
// each case, so a variable missing from here leaks between tests and one case
// silently configures the next.
const KEYS = [
  'AI_PROVIDER',
  'AI_API_KEY',
  'AI_MODEL',
  'AI_MAX_OUTPUT_TOKENS',
  'AI_EFFORT',
  'AI_BASE_URL',
  'AI_GATEWAY_TOKEN',
] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return aiConfig();
}

describe('aiConfig', () => {
  it('runs on the engines when there is no key', () => {
    expect(withEnv({}).provider).toBe('none');
  });

  it('treats an empty key as no key', () => {
    expect(withEnv({ AI_API_KEY: '   ' }).provider).toBe('none');
  });

  // The default changed. It was OpenAI, from when that was the only key to
  // hand; the deployment runs on a Claude account now, and a default that
  // quietly points a Claude key at OpenAI's endpoint fails with an
  // authentication error saying nothing about the cause.
  it('defaults to Claude when a key is set and nothing else is said', () => {
    const config = withEnv({ AI_API_KEY: 'sk-ant-test' });
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-opus-5');
  });

  it('uses OpenAI when asked, with an OpenAI model', () => {
    const config = withEnv({ AI_API_KEY: 'sk-test', AI_PROVIDER: 'openai' });
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4.1-mini');
  });

  it('never hands one provider the other’s default model', () => {
    expect(withEnv({ AI_API_KEY: 'k' }).model).not.toMatch(/^gpt/);
    expect(withEnv({ AI_API_KEY: 'k', AI_PROVIDER: 'openai' }).model).not.toMatch(/^claude/);
  });

  it('honours an explicit model over the default', () => {
    expect(withEnv({ AI_API_KEY: 'k', AI_MODEL: 'claude-sonnet-5' }).model).toBe('claude-sonnet-5');
    expect(withEnv({ AI_API_KEY: 'k', AI_PROVIDER: 'openai', AI_MODEL: 'gpt-4.1' }).model).toBe(
      'gpt-4.1',
    );
  });

  it('can be switched off even with a key present', () => {
    expect(withEnv({ AI_API_KEY: 'k', AI_PROVIDER: 'none' }).provider).toBe('none');
  });

  it('gives a budget large enough that thinking cannot truncate the answer', () => {
    expect(withEnv({ AI_API_KEY: 'k' }).maxOutputTokens).toBe(16000);
  });

  it('falls back to a sane budget when the setting is rubbish', () => {
    expect(withEnv({ AI_API_KEY: 'k', AI_MAX_OUTPUT_TOKENS: 'lots' }).maxOutputTokens).toBe(16000);
  });

  it('rejects an effort level it does not recognise', () => {
    expect(withEnv({ AI_API_KEY: 'k', AI_EFFORT: 'enormous' }).effort).toBe('high');
    expect(withEnv({ AI_API_KEY: 'k', AI_EFFORT: 'low' }).effort).toBe('low');
  });
});

/**
 * Routing through a gateway.
 *
 * The case that matters is the one without an Anthropic key at all. Cloudflare
 * AI Gateway can hold the provider credential itself — from a stored key, or
 * from prepaid credits — and then this deployment has nothing to put in
 * AI_API_KEY. Reading "configured" as "AI_API_KEY is set" would switch the
 * Intelligence Layer off on a setup that works perfectly.
 */
describe('aiConfig through an AI gateway', () => {
  const GATEWAY = 'https://gateway.ai.cloudflare.com/v1/acc/amryn/anthropic';

  it('is configured by a gateway alone, with no provider key', () => {
    withEnv({ AI_API_KEY: '', AI_BASE_URL: GATEWAY, AI_GATEWAY_TOKEN: 'cf-token' });
    const config = aiConfig();

    expect(config.provider).toBe('anthropic');
    expect(config.apiKey).toBeNull();
    expect(config.baseUrl).toBe(GATEWAY);
    expect(config.gatewayToken).toBe('cf-token');
  });

  it('treats half a gateway as no gateway', () => {
    // An endpoint with no token is refused by the gateway; a token with no
    // endpoint is sent to Anthropic, which has never heard of it. Either way
    // the layer would be "on" and every call would fail, which is worse than
    // being off and saying so.
    withEnv({ AI_API_KEY: '', AI_BASE_URL: GATEWAY });
    expect(aiConfig().provider).toBe('none');

    withEnv({ AI_API_KEY: '', AI_GATEWAY_TOKEN: 'cf-token' });
    expect(aiConfig().provider).toBe('none');
  });

  it('still carries a provider key when one is set as well', () => {
    // BYOK through the gateway: Cloudflare forwards our key rather than
    // supplying its own. Both halves have to survive.
    withEnv({ AI_API_KEY: 'sk-ant-real', AI_BASE_URL: GATEWAY, AI_GATEWAY_TOKEN: 'cf-token' });
    const config = aiConfig();

    expect(config.apiKey).toBe('sk-ant-real');
    expect(config.gatewayToken).toBe('cf-token');
  });

  it('reports nothing configured when the layer is off', () => {
    withEnv({ AI_API_KEY: '', AI_PROVIDER: 'none', AI_BASE_URL: GATEWAY, AI_GATEWAY_TOKEN: 'x' });
    const config = aiConfig();

    expect(config.provider).toBe('none');
    expect(config.baseUrl).toBeNull();
    expect(config.gatewayToken).toBeNull();
  });
});
