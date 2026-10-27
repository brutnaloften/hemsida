# Brutna Löften

En databas som spårar politiska löften. Löften samlas in en gång per mandatperiod från en fast källa (först Tidöavtalet, 2022–2026) och följs sedan mot officiella dokument från Riksdagen (data.riksdagen.se: dir, SOU, prop, bet/votering, SFS). Varje löfte får en bevistidslinje och ett manuellt satt utfall med motivering.

## Data

- Löften: en JSON-fil per löfte i `src/data/<mandatperiod>/promises/`.
- Källdokument: `src/data/sources/`.
- Gemensamt Zod-schema: `src/schema/promise.ts`. Datamodellen beskrivs i [`docs/data-model.md`](docs/data-model.md).
- Alla ändringar av data går via pull requests.

## Getting Started

```bash
pnpm dev
```

Övriga kommandon: `pnpm build`, `pnpm test` (vitest), `pnpm typecheck`, `pnpm fmt:check`. CI kör dem på varje pull request.

Open [http://localhost:4321](http://localhost:4321) to see the site.

## Stack

- [Astro](https://astro.build/) — static site framework
- [React](https://react.dev/) — interactive islands (search page)
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [Zod](https://zod.dev/) — schema for promise data
- [Vitest](https://vitest.dev/) — tests
- [uFuzzy](https://github.com/leeoniya/uFuzzy) — client-side fuzzy search

## Deploy

The site is automatically deployed to GitHub Pages on every push to `main`.
