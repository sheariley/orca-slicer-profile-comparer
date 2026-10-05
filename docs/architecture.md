# Architecture

The comparer runs the same UI and logic in three places: a Tauri desktop app, an OrcaSlicer plugin, and a browser playground. Only the host adapter differs between them. The rules behind this are in [AGENTS.md](../AGENTS.md); this page shows how the pieces connect.

## Layers

```
                 apps/desktop          apps/orca-plugin          apps/playground
              (composition roots: each picks one host adapter and wires the app)
                      │                       │                        │
                      ▼                       ▼                        ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │ ui         React components; gets the app layer from <AppProvider>        │
   ├───────────────────────────────────────────────────────────────────────────┤
   │ app        use cases: listPresets, loadResolved, compare, ...             │
   ├───────────────────────────────────────────────────────────────────────────┤
   │ core       model, normalize, resolve, diff, errors, ports (interfaces)    │
   └───────────────────────────────────────────────────────────────────────────┘
                      ▲ implements ports      ▲                        ▲
                 host-tauri              host-orca                host-memory
                      │                       │ bridge-protocol         │
                Tauri fs plugin          window.orca ⇄ Python      in-memory docs
                      │                       │                        │
            OrcaSlicer data folder     orca.host.preset_bundle()    test fixtures
```

- Arrows into `core` mean "implements a port". Nothing in `ui`, `app`, or `core` imports a host adapter; only the composition roots do.
- `setting-catalog` implements the `SettingCatalog` port from generated data, and is shared by all three apps.

## Comparing two presets

1. The UI asks `app.compare(left, right)`.
2. `app` reads each preset through the `ProfileRepository` port, follows its `inherits` chain one parent at a time with `resolveParent`, and collects the raw documents.
3. `core.resolveChain` merges each chain (nearest preset wins) and records which preset defined each value.
4. `core.diffProfiles` compares the two resolved profiles key by key.
5. The UI labels each row through the `SettingCatalog` port.

## The plugin bridge

Inside OrcaSlicer, the page can't read files. `host-orca` sends versioned JSON requests through `window.orca.postMessage`; the plugin's Python `on_message` answers through `post_message`. The message shapes live in `packages/bridge-protocol`, and `samples/exchanges.json` holds request/response pairs that both the TypeScript and the Python tests replay, so the two sides can't drift apart silently.
