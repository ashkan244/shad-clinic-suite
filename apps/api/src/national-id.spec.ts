import { describe, expect, it } from 'vitest';
import { isValidNationalId, normalizeDigits } from './national-id.js';

describe('normalizeDigits', () => {
  it('converts Persian and Arabic digits and strips separators', () => {
    expect(normalizeDigits('۱۷۴-۱۲۳ ۴۵۶۵')).toBe('1741234565');
    expect(normalizeDigits('٠٩١٢')).toBe('0912');
  });
});

describe('isValidNationalId', () => {
  it('accepts IDs with a correct check digit', () => {
    expect(isValidNationalId('1741234565')).toBe(true);
    expect(isValidNationalId('0499370899')).toBe(true);
  });

  it('rejects wrong check digits, bad lengths and repeated digits', () => {
    expect(isValidNationalId('1741234567')).toBe(false);
    expect(isValidNationalId('123456789')).toBe(false);
    expect(isValidNationalId('1111111111')).toBe(false);
    expect(isValidNationalId('abcdefghij')).toBe(false);
  });
});
