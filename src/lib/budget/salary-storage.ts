import { z } from 'zod';

/**
 * The one localStorage key the salary estimate lives under (P8). It holds the monthly salary, the
 * applied value and the two editable assumptions, only in this browser. It is never put in the
 * URL, sessionStorage or any request.
 */
export const SALARY_STORAGE_KEY = 'brutnaloften:salary-estimate:v1';

const stored = z.object({
  monthly: z.string().max(40),
  consumption: z.string().max(40),
  vat: z.string().max(40),
  applied: z.string().max(40).nullable(),
});

export type StoredSalary = z.infer<typeof stored>;

/** Reads and validates the stored estimate; null when missing, unreadable, corrupt or old. */
export function loadSalary(): StoredSalary | null {
  try {
    const raw = window.localStorage.getItem(SALARY_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Writes the estimate; failures (storage unavailable or full) are ignored. */
export function saveSalary(value: StoredSalary): void {
  try {
    window.localStorage.setItem(SALARY_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage may be blocked; the estimate then lives in memory only.
  }
}

export function clearSalary(): void {
  try {
    window.localStorage.removeItem(SALARY_STORAGE_KEY);
  } catch {
    // Nothing to do.
  }
}
