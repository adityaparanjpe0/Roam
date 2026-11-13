# Roam frontend

React + TypeScript + Vite frontend for Roam. The current page introduces the planned travel planner; its itinerary preview is a static concept, not a generated or interactive itinerary.

Authentication, backend integration, AI planning, maps, persistence, and PDF export are not implemented. This frontend runs independently without a database, Docker, environment file, or provider keys.

## Prerequisites

- Node **24.22.3**, pinned in [`.nvmrc`](../.nvmrc).
- npm (verification used **11.5.1**).

Use one of the setup paths below. Commands start from the repository root.

### With the pinned Node version already installed

```bash
node --version
cd frontend
npm ci
npm run dev
```

Check that the first command reports `v24.22.3`.

### With nvm already installed

```bash
nvm install
nvm use
cd frontend
npm ci
npm run dev
```

If `nvm` reports `command not found`, use the alternative below. nvm is optional and is not installed by this repository.

### Without nvm

If `node` and `npm` are already available, npm can download and run the pinned Node version from its cache without replacing the global installation:

```bash
cd frontend
npm exec --yes --package=node@24.22.3 -- node --version
npm exec --yes --package=node@24.22.3 -- npm ci
npm exec --yes --package=node@24.22.3 -- npm run dev
```

This path requires registry access on the first download. Use the same `npm exec --yes --package=node@24.22.3 --` prefix for the checks below if your global Node version differs.

## Development and verification

Open the local URL printed by Vite, normally `http://localhost:5173/`. Vite may choose another port when that port is occupied. Save a source file to update the running page. Stop the server with **Control+C**.

Run these commands from this directory using the pinned Node version:

| Command | Purpose |
|---|---|
| `npm ci` | Install exactly the dependency tree recorded in the lockfile. |
| `npm run dev` | Start the development server with live updates. |
| `npm run lint` | Check TypeScript/React code with ESLint. |
| `npm run typecheck` | Check both TypeScript projects in strict mode without emitting JavaScript. |
| `npm run test` | Run Vitest in watch mode for local development. |
| `npm run test -- --run` | Run the test suite once and exit. |
| `npm run build` | Typecheck and build production assets into `dist/`. |
| `npm run preview` | Serve the existing production build locally; run the build first. |

The preview command prints its own URL, normally `http://localhost:4173/`. It is a local build check, not the planned production hosting setup.

For example, without nvm:

```bash
npm exec --yes --package=node@24.22.3 -- npm run lint
npm exec --yes --package=node@24.22.3 -- npm run typecheck
npm exec --yes --package=node@24.22.3 -- npm run test -- --run
npm exec --yes --package=node@24.22.3 -- npm run build
```

## Source structure

| Location | Responsibility |
|---|---|
| [`src/main.tsx`](src/main.tsx) | Mount React and import shared styles. |
| [`src/App.tsx`](src/App.tsx) | Compose the skip link, header, landing page, and footer. |
| [`src/components/`](src/components/) | Reusable header/footer components. |
| [`src/routes/`](src/routes/) | Landing-page content and its responsive CSS. |
| [`src/styles/tokens.css`](src/styles/tokens.css) | Shared colors, typography, spacing, and radii. |
| [`src/styles/global.css`](src/styles/global.css) | Base styles, site framing, and keyboard focus indicators. |
| [`src/App.test.tsx`](src/App.test.tsx) | Tests for landmarks, navigation targets, and truthful feature-status messaging. |
| [`src/test/setup.ts`](src/test/setup.ts) | DOM matchers and cleanup between tests. |
| [`vitest.config.ts`](vitest.config.ts) | Reuse Vite configuration and select jsdom as the test environment. |

Tests use Vitest, Testing Library, jest-dom, and jsdom. jsdom supplies a browser-like DOM but does not verify actual layout. Check layout in a browser as well.

## UI review checklist

- Check widths of 320, 375, 768, 1024, and 1440 pixels for clipping or horizontal overflow.
- Use Tab from page load: the skip link should become visible. Enter should focus the main content; the next Tab should reach the primary CTA.
- Verify the CTA reaches planned features and the footer link returns to the top.
- Verify the CTA darkens on hover and keyboard focus stays visible.
- Check reflow with enlarged text and review the single-column mobile layout.
- Preserve the development notice and the illustrative-preview caption.
- Use shared tokens, clear headings, spacing, and purposeful feedback. Avoid decorative badges, redundant labels, arbitrary italics, or controls for unavailable features.

No browser automation package is installed in the project. Earlier Chrome layout/keyboard checks used temporary Playwright tooling; screen-reader and cross-browser testing remain unverified.

## Known limitations

The dependency audit on 2026-11-12 reported **10 moderate findings** associated with `minimatch` in the development lint toolchain. `npm audit --omit=dev` reported **0 vulnerabilities**. These results are dated observations, not guarantees; rerun the audit when dependencies change. No forced major override or lint-stack downgrade was applied.

React Router and TanStack Query are deferred until there are multiple routes and server data to support. There is no API proxy or production backend serving configuration yet. The intended same-origin deployment remains documented in the [technical design](../docs/DESIGN.md).

See [project memory](../docs/memory.md) for branch evidence, verification limits, and merge/review status.
