# AGENTS.md

OrcaSlicer Profile Comparer: a cross-platform tool for comparing OrcaSlicer **filament** and **process** profiles in a diff-like view of how their settings differ. It's also an editor. From the diff view, users can copy individual setting values from one profile to another, or bulk-copy settings from one profile to many target profiles at once, and save the changed profiles back to disk. It ships first as a Tauri desktop app and later as an OrcaSlicer plugin, running the same UI and core in both.

**Status:** scaffolded. Comparing works end to end (read-only) in the playground, desktop, and plugin builds. Not built yet:

- **Editing:** transfers, bulk copy, undo, and saving (`core/edit/`, `core/serialize/`, `app/session/`, and the matching UI features).
- **`include` templates:** inheritance resolution doesn't apply them yet (see "OrcaSlicer profile format").
- **Settings store:** the `SettingsStore` port is defined but no app uses it yet.
- **Built-in defaults (highest priority):** OrcaSlicer starts every root preset from its built-in defaults, and the core doesn't apply them yet. Comparing a preset whose chain ends at a sparse system preset against one built on a fully spelled-out user `base` preset shows many one-sided rows (`—`) that OrcaSlicer would display as default values. Extract the defaults from `set_default_value` in `PrintConfig.cpp` into the setting catalog, and start every resolution from them.
- **Known UI gaps:**
  - Labels repeat ("Fan speed" three times) because the catalog lacks OrcaSlicer's tab and section grouping (`Tab.cpp`).
  - The pickers list non-selectable templates (`instantiation: "false"`) and show presets from both user folders with identical labels.
  - Units are appended to values that are already percentages (`50% %`).

The desktop app builds and runs on Windows and in WSL. It has been checked end to end against a real OrcaSlicer data folder on Windows.

**OrcaSlicer source:** many directives here point into OrcaSlicer's source code, which is the source of truth for the profile format, setting definitions, and plugin API. In the local workspace a clone sits next to this repo at `../OrcaSlicer/`. Otherwise, clone [OrcaSlicer/OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer). Treat it as read-only reference material.

## Requirements

- **User-friendly UI.** The audience is OrcaSlicer users, not developers, so the UI should feel like a polished desktop tool:
  - Side-by-side diff that can switch between showing only differences and showing everything, plus a search or filter by setting name.
  - Settings shown by their OrcaSlicer labels and grouped the way OrcaSlicer's tabs group them, with the raw key still available.
  - Easy profile picking (browse system and user presets by vendor and printer, or open a file) instead of typing paths.
  - One-click transfer of a value in either direction, with a clear indicator of unsaved changes, undo, and a confirmation before saving.
  - **Bulk copy to multiple targets:** pick one or more settings in a source profile and copy them to many target profiles of the same type in one action.
    - Choose targets from the preset browser, with multi-select, filters (vendor, printer, user vs. system), and select-all.
    - Before applying, show a per-target preview: the current value, the new value, and which targets are already equal and will be skipped.
    - Apply as one undoable operation, while still letting users drop individual targets or settings from the batch.
    - On save, report the result for each target (saved, skipped, failed, needs a new user preset). One target failing must not stop the others or hide which ones succeeded.
  - Readable rendering of arrays, percentages, and multi-line G-code. Show where an inherited value came from.
- **Cross-platform.** It must run on Windows, macOS, and Linux, matching OrcaSlicer's own platforms:
  - Use a stack and packaging that ship on all three.
  - Build file paths with platform APIs, never hard-coded separators.
  - Detect the OrcaSlicer config directory per OS (see "OrcaSlicer profile format") and let users override it.
  - Handle preset filenames that contain spaces, `@`, and other unusual characters. Don't assume the filesystem is case-sensitive or case-insensitive.
  - Expect Windows file locking when OrcaSlicer has a file open.
  - Run tests and CI on all three OSes.

## Stack

- **Use TypeScript everywhere outside the Python plugin layer.** Use React for the UI and Vite for builds. Don't use Next.js: there's no server.
- **Ship the desktop app with Tauri 2.** Use Tauri's official JS plugins (file system, path, dialog) for host access, and keep custom Rust to the minimum. Tauri is chosen over Electron because it renders in the OS web view, the same engines the OrcaSlicer plugin runs in (WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux). Web view quirks then show up during desktop development.
- **Plan for an OrcaSlicer plugin as a second host.** The same UI and core must later run as an OrcaSlicer plugin without changes. See "OrcaSlicer plugin target".
- **Use pnpm workspaces for the monorepo.** Its strict installs back up the layering: a package can only import what it declares. Don't switch to npm, Yarn, or Bun without revisiting [ADR 0001](docs/adr/0001-pnpm-workspaces.md), which records the reasons and alternatives.
- **Use Vitest** for unit and contract tests, and **React Testing Library** for component tests.
- **Keep TypeScript on 6.0** until typescript-eslint supports TypeScript 7 (its peer range is `<6.1`). The pin and its reason are in `pnpm-workspace.yaml`.
- **Run tools with Node's built-in TypeScript support** (`node file.ts`, Node 22.18+). Tools and build scripts need no compile step.
- **Record significant decisions as ADRs** in `docs/adr/`.

## Architecture: isolate the UI and core from hosts

The host interface (Tauri) and the plugin interface (OrcaSlicer's Python `orca` API, still new) will both change. Design so a change in either touches only that host's adapter.

- **Split the code into layers with one-way dependencies:** `ui` → `app` → `core`. Host adapters depend on `core` (to implement its ports). Nothing in `core`, `app`, or `ui` depends on an adapter.
  - **`core`:** pure domain logic. Covers the profile model, value normalization, inheritance resolution with provenance, diffing, the edit model for transfers (one source to one or many targets), undo/redo, and serialization that preserves formatting. No I/O, DOM, React, Tauri, or `orca` imports. Everything is deterministic and synchronous where possible.
  - **`app`:** use cases such as "load profiles to compare", "transfer value", "bulk transfer to many targets", "save changes", and "list available presets". These coordinate `core` with the ports. The UI calls only this layer.
  - **`ui`:** React components and hooks. They get the `app` layer through context. The UI never calls a host API directly.
- **`core` owns the ports.** Define host-facing interfaces in `core/ports` in domain terms: for example a `ProfileRepository` (list presets, read a raw profile document, save one), a `SettingCatalog` (labels, units, groups), and a `SettingsStore` (user preferences). Adapters implement them. Never shape a port after one host's API.
- **Let hosts declare their capabilities.** Each adapter reports what it supports (for example `canSave`, `canBrowseFiles`, `canWatchForChanges`). The `app` and `ui` layers adapt to those capabilities, such as making the view read-only when saving isn't supported, instead of checking which host they're in. Never branch on "am I in Tauri or OrcaSlicer?" outside the composition root.
- **Translate at the boundary.** Adapters convert host data (Tauri paths, `orca` `Preset` objects, JSON messages) into core types and back. Host types must never leak past an adapter.
- **Validate everything crossing a boundary.** Parse plugin messages and profile files with schemas (zod) before they reach `core`. Treat host data as untrusted.
- **Have the core resolve inheritance itself, from raw profile documents.** Some hosts hand over already-resolved values (the OrcaSlicer plugin API does), but only the raw document says which keys a profile owns, and saving depends on that. Treat host-resolved values as a cross-check at most.
- **Use one composition root per app.** Each entry point (desktop, plugin, playground) is the only place that picks and wires an adapter.
- **Treat a single transfer as a bulk transfer with one target.** Use one code path in `core` and `app` for both, so the same rules apply either way: skip targets that are already equal, check type and key compatibility, decide array lengths, and handle system targets. A batch is one undo step made of per-target change sets, and `saveChanges` returns a result for each target instead of all-or-nothing.
- **Enforce the layering with tooling, not convention.** Make each layer a workspace package and add ESLint (`no-restricted-imports`) and dependency-cruiser rules that fail the build on forbidden imports. See "Dependency rules".

## Directory structure

Folders marked `(planned)` don't exist yet.

```
orca-slicer-profile-comparer/
├── AGENTS.md
├── README.md
├── package.json                # private root: scripts and repo-wide dev tools only
├── pnpm-workspace.yaml         # workspace globs + catalog of shared dependency versions
├── tsconfig.base.json          # strict compiler settings every package extends
├── tsconfig.json               # root config files and scripts/
├── eslint.config.js            # includes the import rules that enforce the layers
├── .dependency-cruiser.cjs     # dependency graph rules, checked in CI
├── vitest.config.ts            # test projects: "node" (*.test.ts) and "dom" (*.test.tsx, jsdom)
├── scripts/run-python.mjs      # runs the right Python interpreter name on each OS
├── .github/workflows/ci.yml    # checks on Windows, macOS, and Linux + desktop build
│
├── packages/
│   ├── core/                   # pure domain logic: no I/O, DOM, React, or host code
│   │   ├── src/
│   │   │   ├── model/          # PresetRef, ProfileDocument, METADATA_KEYS
│   │   │   ├── normalize/      # string/array normalization, equality
│   │   │   ├── resolve/        # inheritance chain resolution + where each value came from
│   │   │   ├── diff/           # resolved profiles → diff rows
│   │   │   ├── edit/           # (planned) ChangeSet, transfer rules (1..n targets), undo/redo
│   │   │   ├── serialize/      # (planned) JSON writer that keeps key order, indentation, line endings
│   │   │   ├── errors/         # ComparerError with a typed kind (access-denied, not-found, ...)
│   │   │   ├── ports/          # ProfileRepository, SettingCatalog, SettingsStore, HostCapabilities
│   │   │   └── index.ts        # the package's public API
│   │   └── test/
│   │       ├── fixtures/       # real OrcaSlicer profiles (tools/sync-fixtures) + hand-written user presets
│   │       └── load-fixtures.ts
│   │
│   ├── app/                    # use cases, built on core + ports
│   │   └── src/
│   │       ├── comparer-app.ts # createComparerApp: the API the UI calls
│   │       ├── use-cases/      # loadResolved (more to come: transferValues, saveChanges)
│   │       └── session/        # (planned) comparison session state (which profiles, pending edits)
│   │
│   ├── ui/                     # React; receives the app layer through a provider
│   │   ├── vitest.setup.ts     # jest-dom matchers + cleanup for the "dom" test project
│   │   └── src/
│   │       ├── ComparerRoot.tsx    # the whole UI; composition roots render this
│   │       ├── ComparerScreen.tsx
│   │       ├── features/       # preset-picker/, diff-view/; (planned) bulk-copy/, save-flow/, settings/
│   │       ├── components/     # shared building blocks
│   │       ├── hooks/          # useComparerApp, useAsync
│   │       ├── providers/      # AppProvider + its context
│   │       └── theme/          # base.css (components), desktop.css and orca.css (token values)
│   │
│   ├── setting-catalog/        # data/settings.json (generated) + SettingCatalog implementation
│   ├── bridge-protocol/        # plugin message schemas (zod), protocol version, samples/exchanges.json
│   ├── host-contract-tests/    # describeProfileRepositoryContract(name, factory) + seed documents
│   ├── host-memory/            # in-memory adapter (tests, browser playground)
│   ├── host-tauri/             # desktop adapter over a HostFileSystem (Tauri fs plugin in production)
│   └── host-orca/              # plugin adapter: bridge client over window.orca
│
├── apps/
│   ├── desktop/                # Tauri app
│   │   ├── src/main.tsx        # composition root: host-tauri → app → ui
│   │   ├── icon-source.svg     # source for src-tauri/icons (regenerate with `pnpm tauri icon icon-source.svg`)
│   │   └── src-tauri/          # tauri.conf.json, capabilities/, Cargo.toml, minimal Rust
│   ├── orca-plugin/
│   │   ├── web/                # composition root (host-orca → app → ui), single-file Vite build
│   │   ├── python/
│   │   │   ├── comparer_plugin.py  # all orca.* glue: Pages capability + OrcaPresetHost
│   │   │   ├── comparer_bridge.py  # protocol handling, stdlib only, no orca imports
│   │   │   └── tests/          # unittest: replays bridge-protocol samples
│   │   └── scripts/build-plugin.ts # inlines the bridge and page into dist/orca_profile_comparer.py
│   └── playground/             # Vite app in a plain browser: host-memory + core's fixtures
│
├── tools/
│   ├── extract-settings/       # parses OrcaSlicer's PrintConfig.cpp → setting-catalog data
│   └── sync-fixtures/          # copies profiles listed in fixtures.json into core's fixtures
│
└── docs/
    ├── architecture.md         # diagram of layers, hosts, and data flow
    └── adr/                    # architecture decision records
```

### Dependency rules

Enforce these with ESLint and dependency-cruiser so CI fails on a violation. Don't rely on code review to catch them.

| Package                     | May depend on                                                |
| --------------------------- | ------------------------------------------------------------ |
| `core`                      | nothing in the workspace; no React, Tauri, DOM, or Node APIs |
| `app`                       | `core`                                                       |
| `ui`                        | `app`, `core` (types only)                                   |
| `setting-catalog`           | `core`                                                       |
| `bridge-protocol`           | nothing in the workspace except `core` types                 |
| `host-contract-tests`       | `core`                                                       |
| `host-memory`, `host-tauri` | `core`                                                       |
| `host-orca`                 | `core`, `bridge-protocol`                                    |
| `apps/*`                    | anything; these are the composition roots                    |
| `tools/*`                   | anything; never imported by packages or apps                 |

- **Only composition roots in `apps/*` import a host adapter.** `ui` and `app` never import a `host-*` package, `@tauri-apps/*`, or anything plugin-specific.
- **Import other packages only through their `index.ts`.** Never import a path deeper inside another package. The one exception is `@comparer/ui/theme/*.css`, which the composition roots import to pick a theme.
- **Tests may also use `host-memory` and `host-contract-tests`**, declared as devDependencies. That's how `app` and `ui` are tested without a real host.
- **Declare every import in `package.json`.** pnpm won't resolve undeclared packages, and dependency-cruiser's `not-to-unresolvable` rule reports them.
- **When you add a package,** add its rules to both `eslint.config.js` (a `restrict(...)` line) and `.dependency-cruiser.cjs`, and update the table above.

### Why it's structured this way

- **Each layer is a package** so the dependency rules can be checked mechanically, and pnpm's strict installs stop a package from importing anything it doesn't declare.
- **`bridge-protocol` is separate from `host-orca`.** The message format is the contract between TypeScript and Python. Both sides test against its sample messages, because the Python layer is stdlib-only and can't share the zod schemas.
- **`host-contract-tests` keeps adapters interchangeable.** Every adapter must pass the same suite. That's what makes testing `app` and `ui` against `host-memory` trustworthy.
- **`setting-catalog` is generated data behind the `SettingCatalog` port.** Both hosts use the same data. Tests can substitute a small fake.
- **`playground` is where most UI work happens.** Run the Tauri app only when real file-system behavior matters.

## Conventions

- **Package names:** `@comparer/<name>`, all `private: true`.
- **Workspace dependencies:** use `workspace:*` for packages in this repo, and `catalog:` for shared third-party versions (React, TypeScript, Vite, zod, Vitest) defined in `pnpm-workspace.yaml`.
- **Tests:** put `*.test.ts` / `*.test.tsx` next to the code they test. Shared fixtures go in the owning package's `test/fixtures/`.
- **Generated files:** never edit them by hand. Regenerate `packages/setting-catalog/data/settings.json` with `pnpm extract-settings`, the system-profile fixtures with `pnpm sync-fixtures`, and the plugin with `pnpm build:plugin`.
- **Source imports use explicit `.ts`/`.tsx` extensions** (`allowImportingTsExtensions`). Packages export their TypeScript source directly; there's no per-package build step.
- **Formatting:** Prettier (`pnpm format`). CI runs `pnpm format:check`.

## Testing

- **Unit-test `core` thoroughly** with fixtures copied from real OrcaSlicer profiles (OrcaSlicer's `resources/profiles/`), including multi-level inheritance, array values, percentages, and G-code.
- **Run the shared contract suite (`host-contract-tests`) against every adapter** (memory, Tauri, plugin) so they behave the same.
- **Test the `app` and `ui` layers against `host-memory`.** They should never need a real file system or OrcaSlicer to be tested.
- **Make sure `ui` runs in a plain browser with `host-memory`** (the `playground` app) for fast development and previews.

## Commands

```bash
pnpm install
pnpm dev:playground     # UI in a browser against host-memory + core's fixtures
pnpm dev:desktop        # Tauri dev build (needs Rust)
pnpm test               # Vitest across all packages
pnpm test:python        # plugin Python tests (unittest)
pnpm lint               # ESLint + dependency-cruiser
pnpm typecheck          # tsc --noEmit in every package
pnpm format             # Prettier
pnpm build:desktop      # Tauri release build
pnpm build:plugin       # single-file plugin: apps/orca-plugin/dist/orca_profile_comparer.py
pnpm extract-settings   # regenerate the setting catalog from ../OrcaSlicer (or --orca <path>)
pnpm sync-fixtures      # refresh system-profile fixtures from ../OrcaSlicer (or --orca <path>)
```

Before finishing a change, run `pnpm lint`, `pnpm typecheck`, and `pnpm test`, plus `pnpm test:python` if you touched the plugin or the bridge protocol.

## Development environment

- **pnpm 12:** install it with `npm install -g pnpm@12`. Corepack 0.34 can't run pnpm 12 (it looks for a `pnpm.cjs` that pnpm 12 no longer ships).
- **WSL with the repo on a Windows drive (`/mnt/...`) is too slow for tests.** Each file lookup takes milliseconds, so jsdom takes over a minute to load and Vitest's "dom" project times out starting its worker. Either run commands from Windows itself (PowerShell with Windows Node), or work from a clone on the Linux filesystem (e.g. `~/src/...`). Don't treat that timeout as a code bug.
- **Desktop builds need Rust** and [Tauri's system prerequisites](https://tauri.app/start/prerequisites/). Everything else only needs Node and Python. A first build takes about 3 minutes; later builds take seconds.
- **On Windows, `pnpm` may be Corepack's shim** (`C:\Program Files\nodejs\pnpm.ps1`), which fails on pnpm 12 the same way. Run `corepack disable pnpm`, then `npm install -g pnpm@12`, or use `npx pnpm@12.9.1`. In PowerShell scripts, call `npx.cmd`, not `npx`: the `npx.ps1` shim drops arguments passed with `@args`.
- **Don't share one checkout's `node_modules` between WSL and Windows.** pnpm installs only the current platform's native binaries (Vite's bundler, the Tauri CLI), so installing from one side breaks the other. Use one side per checkout.
- **To drive the desktop app from a script,** enable WebView2's DevTools port in a local, uncommitted copy of `tauri.conf.json`: set `app.windows[0].additionalBrowserArgs` to `"--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --remote-debugging-port=9333"`. The `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable is ignored, because Tauri passes its own browser arguments. Then connect to `http://127.0.0.1:9333/json` with the Chrome DevTools Protocol.

## Host adapters as built

- **Desktop (`host-tauri`):**
  - Reads OrcaSlicer's data folder (`configDir()/OrcaSlicer`):
    - `system/<Vendor>/<type>/*.json` for system presets. Only the vendors the user installed are there.
    - `user/<user_id>/<type>/*.json` for user presets.
    - `user/<user_id>/<type>/base/*.json` for user root presets (`inherits: ""`, every setting spelled out).
    - `<user_id>` is `default` when signed out, or the account id when signed in. Both folders can exist, often with copies of the same presets.
  - Preset ids are absolute file paths. Names come from file names, which OrcaSlicer keeps equal to preset names.
  - Parents resolve in the child's own user folder first, then among system presets of the same vendor, then any system preset. Real user presets often inherit from other user presets, usually `base` ones.
  - A preset can name a parent that no longer exists. That's a real state of user data, so report it as `not-found`; it's not a bug.
  - Every file call goes through the `HostFileSystem` interface, so the contract tests run against an in-memory file system. The production implementation wraps Tauri's fs plugin.
  - File access is limited to `$CONFIG/OrcaSlicer` by `src-tauri/capabilities/default.json`. Widen that scope deliberately, never with a blanket permission.
  - Saving reports `canSave: false` until `core/serialize/` exists.
- **Plugin (`host-orca` + `apps/orca-plugin/python/`):**
  - Preset ids are `"<type>:<name>"`, unique within a preset collection. A system preset's vendor is the folder two levels above its file.
  - The plugin builds to a single `.py` file with a PEP 723 header, the bridge code, and the page inlined.
  - `get_icon()` isn't implemented yet. It needs a path to an icon file, which a single-file plugin doesn't ship.
  - The plugin has only been exercised against a stand-in `orca` module, not inside OrcaSlicer. Test it in an OrcaSlicer nightly before relying on it.

## OrcaSlicer source reference

Paths are relative to the OrcaSlicer repo root.

| Path                                           | What it holds                                                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `resources/profiles/<Vendor>.json`             | Vendor index: `version`, plus `machine_model_list`, `machine_list`, `filament_list`, `process_list` mapping preset names to `sub_path` files |
| `resources/profiles/<Vendor>/filament/*.json`  | Filament presets                                                                                                                             |
| `resources/profiles/<Vendor>/process/*.json`   | Process (print settings) presets                                                                                                             |
| `resources/profiles/<Vendor>/machine/*.json`   | Printer presets                                                                                                                              |
| `src/libslic3r/PrintConfig.cpp`                | Definitions of every setting: key, label, tooltip, category, type, default, units                                                            |
| `src/libslic3r/Preset.cpp`, `PresetBundle.cpp` | Preset loading, inheritance resolution, and which keys belong to filament, process, and printer presets                                      |
| `src/slic3r/plugin/`                           | Plugin system: loader, Python bindings (`host/`), capability types (`pluginTypes/`), file-access audit (`PluginAuditManager`)                |
| `sandboxes/*.py`                               | Example plugins                                                                                                                              |

## OrcaSlicer profile format

- Profiles are JSON objects that mix settings with **metadata keys**. The metadata keys are listed in `METADATA_KEYS` (`core/src/model/profile.ts`), taken from the `BBL_JSON_KEY_*` / `ORCA_JSON_KEY_*` constants in OrcaSlicer's `Preset.hpp`: `type` (`filament` / `process` / `machine`), `name`, `inherits`, `include`, `from` (`system` / `User`), `setting_id`, `base_id`, `user_id`, `filament_id`, `instantiation`, `version`, `is_custom_defined`, `description`, `renamed_from`, `created_time`, and `updated_time`. Metadata is never inherited, compared, or copied. `compatible_printers` is a real setting, not metadata.
- **Inheritance:** a profile usually lists only the keys it overrides and points to a parent through `inherits` (by preset name, e.g. `"Bambu ABS @base"` or `"fdm_process_single_0.06_nozzle_0.2"`). Parents can chain several levels deep. A meaningful comparison usually needs the **fully resolved** profile: walk the `inherits` chain and let child keys override parent keys. It can also help to show where each value came from.
- **`include` templates (not implemented yet):** about 1,500 bundled profiles also list `include`, an array of template preset names (or one bare name). OrcaSlicer resolves a preset as follows (`PresetBundle.cpp`, the install step after `parse_subfile`):
  1. Start from the parent's resolved settings. A preset with no `inherits` starts from OrcaSlicer's built-in defaults instead (`set_default_value` in `PrintConfig.cpp`).
  2. Layer each included template on top, in the order listed. What gets layered is the template's resolved settings minus the defaults, not just the keys in its own file.
  3. Apply the preset's own keys last.

  OrcaSlicer then pads per-variant arrays to the parent's length. Extend `resolveChain` to support this before comparing profiles that use `include`. The current fixtures don't.

- `instantiation: "true"` marks a preset users can pick. `"false"` (or a missing key on `@base` / `fdm_*` templates) marks an abstract parent.
- **Values are strings.** Numbers and booleans are stored as strings (`"0.4"`, `"1"`). Per-extruder or per-filament settings are arrays of strings (e.g. `"hot_plate_temp": ["100"]`). Some values are percentages (`"50%"`) or multi-line G-code. Normalize before comparing so that, say, `"16"` and `["16"]` don't show up as a false difference.
- Parent names are resolved within the same vendor directory. Filaments and processes also inherit from shared bases such as `fdm_filament_common` and `fdm_process_common`, found in the vendor folder or in `resources/profiles/OrcaFilamentLibrary/`.
- User-created presets live in the OrcaSlicer config directory under `user/<user_id>/{filament,process,machine}/` (`%APPDATA%\OrcaSlicer` on Windows, `~/.config/OrcaSlicer` on Linux, `~/Library/Application Support/OrcaSlicer` on macOS). Each is a `.json` with a sibling `.info` file. They often inherit from a system preset by name.
- Human-readable labels, units, and the settings tab or group for each key come from `PrintConfig.cpp`. Use them to label and group the diff view instead of showing raw keys alone.

## Writing profiles back (transfer and save)

- **Write to the profile's own file, not the resolved view.** Copying a value into a profile that inherits means adding or updating that key as an override in its own JSON. Don't flatten the whole inheritance chain into the file. If the copied value equals what the profile would inherit anyway, consider removing the override instead of keeping a redundant key.
- **System profiles are effectively read-only.** Files under `resources/profiles/` (and OrcaSlicer's installed or cached copies) get replaced on app updates. Saving should target user presets. If the target is a system preset, offer to save as a new user preset that `inherits` from it.
- **Keep OrcaSlicer's value format.** Write values back as strings or string arrays exactly as the target expects. Watch array length on per-extruder or per-filament keys: a one-element array copied into a profile expecting a different length needs a deliberate rule. Never write native JSON numbers or booleans.
- **Keep the metadata consistent.** Leave the target's metadata keys (`METADATA_KEYS`) alone. A transfer should never copy them across. For user presets, keep the sibling `.info` file valid. Check how OrcaSlicer writes it, including any update timestamp or sync fields, before touching it.
- **Avoid spurious diffs.** Keep the original key order, indentation (profile files use 4 spaces, though some vendor index files use tabs, so match what's in the file), and line endings, so a saved file differs only in the keys that changed.
- **Make saves safe.** Write atomically (temp file, then rename), keep a backup or support undo, and warn that OrcaSlicer may overwrite the file or not pick up the change while it's running. Users should close it, or re-select the preset, before or after saving.
- **Only copy compatible keys.** Filament keys can only go into filament profiles and process keys into process profiles. Which keys belong to which preset type is defined in `Preset.cpp` and `PresetBundle.cpp`.
- **Apply every rule per target in a bulk copy.** Each target has its own inheritance chain, so the same copied value can be a new override in one target, redundant in another, and a different array length in a third. Resolve and validate each target on its own. Never assume what's true for one target holds for the rest.
- **Save bulk changes file by file, not all or nothing.** Each target is written atomically, but a batch can't be atomic across files. Save the targets one by one, collect a result for each, and keep failed targets' edits pending so the user can retry them. When the batch includes system presets, ask once whether to create user presets for them, and show which ones it affects.

## OrcaSlicer plugin target

What OrcaSlicer's plugin system offers today (in OrcaSlicer's `src/slic3r/plugin/`, with examples in `sandboxes/`):

- Plugins are Python 3.12 files with a `[tool.orcaslicer.plugin]` metadata header and an `@orca.plugin` class that registers capabilities.
- Plugin UI is HTML shown in OrcaSlicer's web view. There are two ways to show it:
  - **A Pages capability** (`PagesPluginCapability`) adds a **tab with an icon to OrcaSlicer's main window**. It implements `get_ui()` (returns the HTML), `get_icon()`, and `on_message(message)`, and sends to the page with `post_message(...)`. The tab appears while the plugin is enabled and disappears when it's unloaded.
  - **Windows and dock panels:** `orca.host.ui.create_window(html=...)` or `create_dock_panel(html=..., dock=...)`, opened from a script capability run from the Plugins dialog.
  - Either way, the page and Python exchange JSON through `orca.postMessage` / `orca.onMessage`, and theme colors come in as CSS variables (`--orca-fg`, `--orca-muted`, `--orca-border`, ...).
- **Plugin config storage** (PR #14746): each capability can store JSON settings with `get_config()` / `save_config(config)`. Settings are stored globally, with an optional override per preset. Users can edit them in the Plugins dialog through a JSON editor or a custom HTML page.
- `orca.host.preset_bundle()` gives read-only access to presets (`prints`, `filaments`, `printers`). Each preset has `name`, `file`, `is_system`, `is_user()`, `config_keys()`, and `config_value()` (resolved values). **There is no API to modify, save, or reload presets.**
- **Plugins are sandboxed on file access** (`PluginAuditManager`, from PR #14989). A CPython audit hook checks every file operation a plugin makes:
  - OrcaSlicer's data folder (`data_dir()`) is readable and writable. Its bundled resources folder is read-only. Any other path requires a permission the user grants.
  - Some files are always denied, even inside allowed folders: the app config (`OrcaSlicer.conf`/`.ini`), the user-secret file, and **any path where some component contains `secret`, `cert`, or `conf`** (case-insensitive).
  - The keyword match is a plain substring test on every folder and file name in the path. Issue [#15944](https://github.com/OrcaSlicer/OrcaSlicer/issues/15944) (open) reports that it blocks numpy, stdlib modules such as `configparser.py`, `certifi/cacert.pem`, and user folders like `Concert`. The only workaround is to import everything when the plugin loads, because only capability calls are checked.
  - **Probable Linux blocker (found by reading the code, not tested, and not yet reported upstream):** on Linux, `data_dir()` defaults to `~/.config/OrcaSlicer`, and `.config` contains `conf`. As written, every file access a plugin makes inside a checked call would be denied on Linux, presets included. A preset file whose name contains one of those keywords (e.g. "…Certified…") would also be denied on every OS.
  - The audit only covers calls into capabilities (`execute`, a Pages capability's `get_ui` and `on_message`, and so on). The `on_message` callbacks passed to `create_window`/`create_dock_panel` currently run without an audit scope. Treat that as a gap that will probably be closed, not as a feature.
- **Status** (from [discussion #14878](https://github.com/OrcaSlicer/OrcaSlicer/discussions/14878), the maintainers' feedback thread):
  - Plugins are nightly-only and "experimental and subject to change". The APIs and capability types "may change significantly".
  - There's no release date and no versioning promise.
  - Maintainers have nothing against plugins that read and write, but they haven't committed to a preset write API.
- **How a third-party plugin saves presets today** (FilamentHub, a community plugin described in the discussion):
  - It writes the preset `.json` and `.info` files directly under `data_dir`, finding the folder from `preset.file` rather than from the app config.
  - It then either does an experimental targeted refresh or asks the user to restart OrcaSlicer.
  - The host can't reload a single preset, and the plugin has to handle name collisions itself.
  - Community members have requested a preset write API, targeted refresh, and preset change events, but nothing has been committed.
- **Related issue:** [#14832](https://github.com/OrcaSlicer/OrcaSlicer/issues/14832) (closed) was a crash when transferring changed settings between printer presets while a Python plugin was loaded. It's worth retesting the comparer's save flow against that scenario.
- **Further reading:**
  - [Plugin system (developer reference)](https://www.orcaslicer.com/wiki/developer_reference/plugin_development/plugin_system.html)
  - [Getting started with plugins](https://www.orcaslicer.com/wiki/plugins/plugins_getting_started.html)
  - [Plugin types](https://github.com/OrcaSlicer/OrcaSlicer/wiki/plugins_types)
  - PRs [#14530](https://github.com/OrcaSlicer/OrcaSlicer/pull/14530) (Python plugins), [#14746](https://github.com/OrcaSlicer/OrcaSlicer/pull/14746) (plugin config; discussion #14878 mislabels it "isolated preset refresh"), and [#14989](https://github.com/OrcaSlicer/OrcaSlicer/pull/14989) (auditing). All three were merged into OrcaSlicer `main` as of October 2026.

Directives:

- **Ship the plugin as a Pages capability.** A main-window tab is the most discoverable entry point, and its message calls run inside the audit scope, the same as a future, tighter sandbox would require. Add a script capability that opens it in a window only if a pop-out view turns out to be needed.
- **Build the UI as one self-contained HTML file** (Vite + `vite-plugin-singlefile`), so the plugin can return it from `get_ui()` (or pass it to `create_window`). Don't rely on loading extra assets at runtime.
- **Design the plugin's file I/O for the strictest sandbox.** Assume every read and write is checked, even the ones that currently aren't. Use the Python standard library only (no third-party packages). Import everything when the plugin loads, so lazy imports don't trip the keyword filter.
- **Keep comparer settings behind the `SettingsStore` port.** Store user preferences (such as default filters or recent comparisons) through it. The plugin adapter implements it with `get_config`/`save_config` and the desktop adapter with a local file. The UI never knows which.
- **Keep the Python layer thin.** It may only translate bridge messages into `orca.host` calls and file I/O, and back. No diffing, resolution, or business logic belongs in Python.
- **Keep every `orca.*` reference** in the Python files and every bridge detail in `host-orca`. A plugin API change should touch only those two.
- **Version the bridge protocol.** Define the message types once in `bridge-protocol`, include a protocol version in a handshake, and validate every message on both sides.
- **Style through design tokens.** Define the UI's colors as CSS variables. The plugin build maps them onto `--orca-*`, and the desktop build supplies its own values.
- **Keep to features all three OS web views support.** Set the build's browser targets to match WebView2, WebKit, and WebKitGTK, and test on all three.
- **Treat plugin saving as unresolved.** Without a preset write API, saving means writing files directly while OrcaSlicer holds presets in memory and may overwrite them or not reload them.
  - Report `canSave: false` from the plugin adapter until saving has been tested on all three OSes. Linux is blocked until the `conf` keyword problem above is fixed upstream (follow #15944).
  - When saving is enabled, model what the user must do after a save as part of the save result (for example `reloadRequired: "restart"`). The UI should tell the user what to do instead of assuming the change took effect.
  - Recheck discussion #14878 and the wiki for a write, reload, or change-event API before building this. If one appears, implement it only in the plugin adapter and the Python layer.
- **Expect file-access denials.** The audit hook can refuse a read or write, or prompt the user for permission. The plugin adapter must turn those refusals into typed errors in `core` (for example `AccessDenied` with the path), and the UI must explain them. Never let them surface as raw Python exceptions or crash the plugin.
- **Expect the plugin API to change.** It's new. Pin the OrcaSlicer version range the plugin is tested against, and detect missing APIs at startup instead of failing partway through.

## Open questions

- **Plugin packaging format.** The build currently produces one `.py` file, like OrcaSlicer's sample plugins. Issue #15944 mentions plugins packaged as wheels, which would allow shipping the page and an icon as separate files. Check the plugin wiki before changing `apps/orca-plugin/scripts/build-plugin.ts`.
