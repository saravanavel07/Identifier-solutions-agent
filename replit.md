# identifier.studio

A guided network troubleshooting workspace that turns vague connectivity problems into a clear, testable path from symptoms to resolution.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/identifier-studio/src/App.tsx` — main app shell, routes, and troubleshooting workflow UI
- `artifacts/identifier-studio/src/index.css` — signal-state theme and shared visual utilities
- `artifacts/api-server/src/routes/troubleshooting.ts` — session lifecycle, collector questions, diagnosis ranking, and fix retry logic
- `lib/api-spec/openapi.yaml` — source of truth for the troubleshooting API contract
- `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` — generated client hooks and validation schemas

## Architecture decisions

- The first version keeps session state in the API process so the agent workflow is fully functional without adding account or database setup.
- The API contract is generated from OpenAPI and the UI uses the generated React Query hooks for every server call.
- The collector always asks one question at a time and only produces diagnosis and fix output after all required symptom fields are captured.
- A failed verification advances to the next ranked cause instead of repeating the same fix.

## Product

- Start a focused troubleshooting session.
- Capture device, symptom, onset, frequency, scope, errors, and recent changes.
- Review ranked probable causes and a recommended diagnostic test.
- Follow plain-language fix steps and verify the result.
- Retry with the next cause when the first fix does not work.
- Reopen recent sessions and review the transcript.

## User preferences

 - Project name: identifier.studio

## Gotchas

- The API server stores sessions in memory in the first version, so restarting the server clears the session archive.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
