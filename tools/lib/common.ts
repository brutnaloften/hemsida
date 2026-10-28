/** Helpers shared by the Tidö and manifesto tools. No SDK imports, so they load fast. */

/** Riksdag committee codes the model may pick from (matches data.riksdagen.se `org`). */
export const COMMITTEES = [
  'AU',
  'CU',
  'FiU',
  'FöU',
  'JuU',
  'KU',
  'KrU',
  'MJU',
  'NU',
  'SfU',
  'SkU',
  'SoU',
  'TU',
  'UbU',
  'UFöU',
  'UU',
] as const;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/å|ä/g, 'a')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}
