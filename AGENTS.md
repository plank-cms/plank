# Repository Guidelines

## Project Structure & Module Organization

This repository is a PNPM + Turborepo monorepo.

- `packages/core`: Express 5 API, auth, controllers, middleware, media providers, and the built admin output under `public/admin`.
- `packages/admin`: React 19 + Vite admin UI with explicit React Router routing.
- `packages/db`: PostgreSQL access, migrations in `src/migrations/*.sql`, reset/migrate utilities.
- `packages/schema`: content schema builder/validation utilities.
- `packages/cli`: distributable `plank` CLI.
- `docs/`: project documentation.
- `scripts/`: release/version automation scripts.

### Admin App Structure

The admin is no longer organized around `src/pages` and generic top-level buckets.

- `src/router`: the explicit route tree built with `createBrowserRouter`.
- `src/layouts`: route shells and layout wrappers that render `Outlet` trees.
- `src/features`: route-oriented feature modules.
- `src/shared`: reusable cross-feature code only.
- `src/styles`: global CSS entrypoints.

Within `packages/admin/src/features`, organize code by domain first, then by route depth:

- top-level feature pages live close to the feature root, for example `features/dashboard/DashboardPage.tsx`
- nested route pages live under `routes/`, for example `features/settings/routes/SettingsUsersPage.tsx`
- feature-local extracted UI lives in `components/`
- feature-local helpers live in `lib/`
- feature-local shared types live in `types.ts` or a focused sibling such as `entryTypes.ts`

Use `src/shared` only for code reused across multiple features:

- `shared/ui`: shadcn and UI primitives
- `shared/components`: reusable app-level components
- `shared/hooks`: reusable hooks
- `shared/context`: shared providers and contexts
- `shared/lib`: shared helpers

## Build, Test, and Development Commands

Run from repo root unless noted.

- `pnpm dev`: starts all package dev tasks via Turbo.
- `pnpm build`: builds all packages in dependency order.
- `pnpm lint`: runs ESLint across workspaces.
- `pnpm format`: formats the repo with Prettier.
- `pnpm db:reset`: resets DB state using `.env`.
- `pnpm --filter @plank-cms/admin dev`: run only admin locally.
- `pnpm --filter @plank-cms/admin build`: build only the admin bundle into `packages/core/public/admin`.
- `pnpm --filter @plank-cms/admin lint`: lint only the admin app.
- `pnpm --filter @plank-cms/core dev`: run only API locally.

## Coding Style & Naming Conventions

- Language: TypeScript with strict settings from `tsconfig.base.json`.
- Formatting (Prettier): no semicolons, single quotes, trailing commas, `printWidth: 100`.
- Linting: ESLint + `typescript-eslint`.
- Naming:
  - `camelCase` for variables, functions, and helpers
  - `PascalCase` for React components and component files
  - `kebab-case` for directory names in route segments and for migration filenames
  - use descriptive page filenames such as `DashboardPage.tsx`, `EntryPage.tsx`, `SettingsUsersPage.tsx`
  - use descriptive layout filenames such as `AppLayout.tsx`, `ContentLayout.tsx`

### Admin Conventions

- Do not reintroduce `src/pages`.
- Do not place feature-specific code in `src/shared`.
- Keep route definitions in `src/router/index.tsx`; routes are not file-system generated.
- Prefer extracting large route files into feature-local `components/`, `lib/`, and `types.ts` before adding more logic inline.
- If a component is only used by one feature, keep it inside that feature.

## Testing Guidelines

There is currently no dedicated automated test suite configured in root scripts. For changes:

- run `pnpm lint` and relevant package build commands
- for admin work, run at least `pnpm --filter @plank-cms/admin lint` and `pnpm --filter @plank-cms/admin build`
- validate key flows manually: admin UI, auth, content operations, media uploads, and any affected role/editorial flow
- include reproduction/verification steps in PRs

If you add tests, colocate them with source files and use `*.test.ts` / `*.test.tsx` naming.

## Shadcn Component Sourcing

- If a required shadcn component is not available in this repository, fetch it directly from the official registry: `https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui`.
- Copy the component into the repository exactly as-is, without modifying its source on import.
- If the imported component depends on packages that are not yet installed in this repository, install those dependencies.
- Shared UI primitives belong in `packages/admin/src/shared/ui`.

## Security & Configuration Tips

- Never commit secrets; keep credentials in local `.env`.
- Validate DB migrations against a non-production database before release.
- For auth/security changes, verify JWT, 2FA, role permissions, and editorial access rules end-to-end.
- For preview-related admin changes, verify preview configuration and draft/published preview flows.

## API Response Contract

- Public API serialized entries must preserve deterministic key order:
  - top-level: `id`, then content-type fields in the exact order defined in Content Type Builder, then system/meta fields
  - array item objects: sub-field keys in the exact order defined in the array field schema
