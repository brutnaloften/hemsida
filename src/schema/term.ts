/**
 * Term record (data model v2, see docs/data-model.md).
 *
 * One file per term, `src/data/<term>/term.json`: who governed, who
 * supported the government, who was in opposition, which government
 * agreements apply (zero or more) and dated role changes mid-term.
 */
import { z } from 'zod';
import { PARTIES, ROLES, partySchema } from './promise';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase slug');

export const roleChangeSchema = z.object({
  /** Date the new role took effect. */
  date: isoDate,
  party: partySchema,
  /** The role from `date` onwards. */
  role: z.enum(ROLES),
  /** Swedish explanation shown on the site. */
  note: z.string().min(1).optional(),
});

export const termSchema = z
  .object({
    /** `YYYY-YYYY`, also the directory name. */
    id: z.string().regex(/^\d{4}-\d{4}$/, 'expected YYYY-YYYY'),
    /**
     * Each party's role at the start of the term; every party is listed, except while
     * `rolesPending` is true (then it is empty).
     */
    roles: z.partialRecord(partySchema, z.enum(ROLES)),
    /**
     * True from the election until a government exists: roles are not known yet, so `roles`
     * is empty and nothing may rely on it. Set to false (and fill `roles`) once it is formed.
     */
    rolesPending: z.boolean().default(false),
    /**
     * Set by hand when the term is fully collected (every party's promises are in). The site's
     * default term (root URL, navbar, search redirect) is the latest term with this flag; terms
     * without it stay reachable from the term switcher. See docs/data-model.md, "Default term".
     */
    published: z.boolean().default(false),
    /** Ids of `government_agreement` sources. May be empty. */
    agreements: z.array(slug).default([]),
    /** Dated role changes during the term, e.g. a government change. */
    role_changes: z.array(roleChangeSchema).default([]),
  })
  .superRefine((t, ctx) => {
    const [from, to] = t.id.split('-').map(Number);
    if (to <= from)
      ctx.addIssue({ code: 'custom', path: ['id'], message: 'end year must follow start' });
    if (t.rolesPending) {
      if (Object.keys(t.roles).length > 0 || t.role_changes.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['rolesPending'],
          message: 'rolesPending requires empty roles and role_changes',
        });
      }
    } else {
      for (const party of PARTIES) {
        if (!(party in t.roles)) {
          ctx.addIssue({ code: 'custom', path: ['roles', party], message: 'missing party' });
        }
      }
    }
    if (new Set(t.agreements).size !== t.agreements.length) {
      ctx.addIssue({ code: 'custom', path: ['agreements'], message: 'duplicate agreement id' });
    }
    t.role_changes.forEach((c, i) => {
      if (
        c.role === t.roles[c.party] &&
        t.role_changes.findIndex((o) => o.party === c.party) === i
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['role_changes', i, 'role'],
          message: 'first change must differ from the starting role',
        });
      }
    });
  });

export type Term = z.infer<typeof termSchema>;
