import { afterEach, describe, expect, it } from 'vitest';
import { aiConfig } from '@/lib/env';

/**
 * Provider selection, which is the setting most likely to be wrong and least
 * likely to announce it: a model name sent to the wrong provider is a 404 at
 * request time, long after the setting that caused it.
 */
const KEYS = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_MAX_OUTPUT_TOKENS', 'AI_EFFORT'] as const;
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

  it('defaults to OpenAI when a key is set and nothing else is said', () => {
    const config = withEnv({ AI_API_KEY: 'sk-test' });
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4.1-mini');
  });

  it('uses Claude when asked, with a Claude model', () => {
    const config = withEnv({ AI_API_KEY: 'sk-test', AI_PROVIDER: 'anthropic' });
    expect(config.provider).toBe('anthropic');
    expect(config.model).toBe('claude-opus-5');
  });

  it('never hands one provider the other’s default model', () => {
    expect(withEnv({ AI_API_KEY: 'k' }).model).not.toMatch(/^claude/);
    expect(withEnv({ AI_API_KEY: 'k', AI_PROVIDER: 'anthropic' }).model).not.toMatch(/^gpt/);
  });

  it('honours an explicit model over the default', () => {
    expect(withEnv({ AI_API_KEY: 'k', AI_MODEL: 'gpt-4.1' }).model).toBe('gpt-4.1');
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
