/**
 * SCB macro series used by the budget pages for "fasta priser" (KPI) and
 * "andel av BNP" (GDP). One file, `src/data/budget/macro.json`, written by
 * `tools/ingest-macro.ts`. Raw published values only; no derived numbers.
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const yearKey = z.string().regex(/^\d{4}$/, 'expected a four-digit year');

const seriesBase = {
  /** SCB table id, e.g. `TAB4352`. */
  source: z.string().min(1),
  /** Date the series was last fetched with changed values (YYYY-MM-DD). */
  fetched_at: isoDate,
};

export const macroSchema = z
  .object({
    /** Every year covered, ascending and contiguous. Both series have a key for each. */
    years: z.array(z.number().int()).min(1),
    /** Consumer price index, annual average (fastställda årsmedeltal). */
    kpi: z.object({
      ...seriesBase,
      base: z.string().min(1),
      values: z.record(yearKey, z.number().positive()),
    }),
    /** GDP at market prices, current prices. `null` where SCB has not published the year yet. */
    bnp: z.object({
      ...seriesBase,
      unit: z.literal('mn kr'),
      values: z.record(yearKey, z.number().positive().nullable()),
      /** Explains missing (null) years. */
      note: z.string().min(1).optional(),
    }),
  })
  .superRefine((m, ctx) => {
    m.years.forEach((y, i) => {
      if (i > 0 && y !== m.years[i - 1] + 1) {
        ctx.addIssue({ code: 'custom', path: ['years', i], message: 'years must be contiguous' });
      }
      if (!(String(y) in m.kpi.values)) {
        ctx.addIssue({ code: 'custom', path: ['kpi', 'values'], message: `missing KPI for ${y}` });
      }
      if (!(String(y) in m.bnp.values)) {
        ctx.addIssue({
          code: 'custom',
          path: ['bnp', 'values'],
          message: `missing BNP key for ${y}`,
        });
      }
    });
    if (Object.values(m.bnp.values).some((v) => v === null) && !m.bnp.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['bnp', 'note'],
        message: 'null BNP values need a note',
      });
    }
  });

export type Macro = z.infer<typeof macroSchema>;
