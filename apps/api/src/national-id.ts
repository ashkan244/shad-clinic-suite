/** Converts Persian/Arabic-Indic digits to ASCII and strips spaces/dashes. */
export function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s-]/g, '');
}

/** Validates an Iranian national ID (کد ملی) including its check digit. */
export function isValidNationalId(value: string) {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 9).reduce((acc, d, i) => acc + d * (10 - i), 0);
  const r = sum % 11;
  return digits[9] === (r < 2 ? r : 11 - r);
}

/** class-transformer hook: normalizes digits on string DTO fields. */
export const toDigits = ({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeDigits(value) : value);
