/**
 * Maps free-text promise areas onto the controlled vocabulary (src/schema/areas.ts).
 *
 * tools/area-mapping.json is grouped by target area (easy to review); this module
 * inverts it. Labels that are not in the file get a *proposal* from the promise's
 * committee, which a human must confirm by adding the label to the file.
 */
import { AREAS, type Area } from '../../src/schema/areas.ts';

export type AreaMappingFile = Record<string, string[]>;

/** Invert the grouped file into label -> area. Throws on unknown targets or duplicate labels. */
export function invertMapping(file: AreaMappingFile): Map<string, Area> {
  const out = new Map<string, Area>();
  const known = new Set<string>(AREAS);
  for (const [target, labels] of Object.entries(file)) {
    if (!known.has(target)) throw new Error(`area-mapping: unknown target area "${target}"`);
    for (const label of labels) {
      const prev = out.get(label);
      if (prev)
        throw new Error(`area-mapping: "${label}" listed under both "${prev}" and "${target}"`);
      out.set(label, target as Area);
    }
  }
  return out;
}

/** Default area per Riksdag committee, used only to propose a mapping for unmapped labels. */
export const COMMITTEE_AREA: Record<string, Area> = {
  AU: 'Arbetsmarknad',
  CU: 'Bostäder och samhällsbyggnad',
  FiU: 'Ekonomi och skatter',
  FöU: 'Försvar och krisberedskap',
  JuU: 'Kriminalpolitik',
  KrU: 'Kultur, medier och idrott',
  KU: 'Rättsstat och demokrati',
  MJU: 'Klimat och miljö',
  NU: 'Näringsliv och företagande',
  SfU: 'Migration och integration',
  SkU: 'Ekonomi och skatter',
  SoU: 'Hälso- och sjukvård',
  TU: 'Infrastruktur och transporter',
  UbU: 'Skola och utbildning',
  UFöU: 'Utrikes, bistånd och EU',
  UU: 'Utrikes, bistånd och EU',
};

export type AreaResolution =
  | { status: 'mapped'; area: Area }
  | { status: 'proposed'; area: Area | undefined };

/** Resolve one promise's area: the mapping wins, a bare vocabulary term maps to itself. */
export function resolveArea(
  label: string,
  committee: string | undefined,
  mapping: Map<string, Area>,
): AreaResolution {
  const trimmed = label.trim();
  if ((AREAS as readonly string[]).includes(trimmed))
    return { status: 'mapped', area: trimmed as Area };
  const hit = mapping.get(trimmed);
  if (hit) return { status: 'mapped', area: hit };
  return { status: 'proposed', area: committee ? COMMITTEE_AREA[committee] : undefined };
}
