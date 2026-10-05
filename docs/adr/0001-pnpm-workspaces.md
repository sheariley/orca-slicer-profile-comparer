# 1. Use pnpm workspaces

- **Status:** accepted
- **Date:** 2026-10-05

## Context

The repo is a monorepo whose architecture depends on strict package boundaries: `ui` must never import a host adapter or `@tauri-apps/*`, and `core` must import nothing at all. We need a package manager whose defaults support that, works on Windows, macOS, and Linux, and is well supported by Tauri, Vite, and Vitest.

## Decision

Use pnpm workspaces, with a catalog in `pnpm-workspace.yaml` for shared third-party versions.

- **Strict installs back up the layering.** A package can only resolve dependencies it declares, so an accidental import of an undeclared package fails instead of silently working through hoisting. dependency-cruiser's `not-to-unresolvable` rule reports these.
- **One place for shared versions.** Packages reference React, TypeScript, Vite, zod, and others as `catalog:`.
- **Built-in filtering** (`pnpm --filter <pkg>...`) is enough at this size, with no Turborepo or Nx.
- **First-class support** in the Tauri, Vite, and Vitest docs, and solid on all three CI operating systems.

## Alternatives considered

- **npm workspaces:** flat, hoisted installs allow undeclared imports.
- **Yarn 1:** in maintenance mode.
- **Yarn 4:** strict in Plug'n'Play mode, but that mode needs extra setup for editors and tooling; its `node_modules` mode loses the strictness.
- **Bun:** very fast, and it has added an isolated install mode, but its workspaces are younger and Windows support has lagged. Worth revisiting; switching later is cheap.

## Consequences

- Contributors need pnpm 12 (`packageManager` in `package.json` pins the version).
- Every package must declare what it imports, including test-only helpers such as `@comparer/host-memory`.
