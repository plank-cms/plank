# Repository Guidelines

## Project Structure & Module Organization

This repository is a PNPM + Turborepo monorepo.

- `packages/core`: Express 5 API, auth, controllers, middleware, media providers.
- `packages/admin`: React + Vite admin UI (`src/pages`, `src/components`, `src/context`).
- `packages/db`: PostgreSQL access, migrations in `src/migrations/*.sql`, reset/migrate utilities.
- `packages/schema`: content schema builder/validation utilities.
- `packages/cli`: distributable `plank` CLI.
- `docs/`: project documentation.
- `scripts/`: release/version automation scripts.

## Build, Test, and Development Commands

Run from repo root unless noted.

- `pnpm dev`: starts all package dev tasks via Turbo.
- `pnpm build`: builds all packages in dependency order.
- `pnpm lint`: runs ESLint across workspaces.
- `pnpm format`: formats the repo with Prettier.
- `pnpm db:reset`: resets DB state using `.env`.
- `pnpm --filter @plank-cms/admin dev`: run only admin locally.
- `pnpm --filter @plank-cms/core dev`: run only API locally.

## Coding Style & Naming Conventions

- Language: TypeScript (strict mode via `tsconfig.base.json`).
- Formatting (Prettier): no semicolons, single quotes, trailing commas, `printWidth: 100`.
- Linting: ESLint + `typescript-eslint` (`@typescript-eslint/no-unused-vars` warns; prefix intentionally unused args with `_`).
- Naming: `camelCase` for variables/functions, `PascalCase` for React components, kebab-case for migration filenames (numeric prefix first, e.g. `026_user_backup_codes.sql`).

## Testing Guidelines

There is currently no dedicated automated test suite configured in root scripts. For changes:

- run `pnpm lint` and relevant package `build` commands,
- validate key flows manually (admin UI, auth, content operations, media uploads),
- include reproduction/verification steps in PRs.
  If you add tests, colocate them with source files and use `*.test.ts` / `*.test.tsx` naming.

## Shadcn Component Sourcing

- If a required Shadcn component is not available in this repository, fetch it directly from the official registry: `https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui`.
- Copy the component into the repository exactly as-is, without modifying its source on import.
- If the imported component depends on packages that are not yet installed in this repository, install those dependencies.

## Security & Configuration Tips

- Never commit secrets; keep credentials in local `.env`.
- Validate DB migrations against a non-production database before release.
- For auth/security changes, verify JWT, 2FA, and role permissions end-to-end.

## API Response Contract

- Public API serialized entries must preserve deterministic key order:
  - top-level: `id`, then content-type fields in the exact order defined in Content Type Builder, then system/meta fields;
  - array item objects: sub-field keys in the exact order defined in the array field schema.
