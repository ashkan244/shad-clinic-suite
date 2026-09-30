import { describe, expect, it } from 'vitest';
import { jwtSecret } from './app.module.js';

describe('jwtSecret', () => {
  it('falls back to a dev secret outside production', () => {
    expect(jwtSecret({ NODE_ENV: 'development' })).toBe('dev-secret');
  });

  it('refuses missing, short or placeholder secrets in production', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production' })).toThrow();
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow();
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'change-me-in-production-change-me-in-prod' })).toThrow();
  });

  it('accepts a strong secret in production', () => {
    const secret = 'a'.repeat(16) + 'b'.repeat(16);
    expect(jwtSecret({ NODE_ENV: 'production', JWT_SECRET: secret })).toBe(secret);
  });
});
