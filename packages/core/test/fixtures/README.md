# Profile fixtures

- `system/<Vendor>/<type>/` holds real OrcaSlicer system profiles. Don't edit them by hand. Add paths to `tools/sync-fixtures/fixtures.json` and run `pnpm sync-fixtures`.
- `user/<user_id>/<type>/` holds hand-written user presets that mirror the layout of OrcaSlicer's config folder.

The folder layout mirrors OrcaSlicer's data folder, so the path tells you each profile's origin, vendor, and type.
