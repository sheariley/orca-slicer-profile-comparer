# Profile fixtures

- `system/<Vendor>/<type>/` holds real OrcaSlicer system profiles. Don't edit them by hand. Add paths to `tools/sync-fixtures/fixtures.json` and run `pnpm sync-fixtures`.
- `user/<user_id>/<type>/` holds user presets written exactly as OrcaSlicer saves them on Windows: sorted keys, CRLF, a final newline, indented with a tab (`My ABS`, current versions) or 4 spaces (`My Old PLA`, older versions). Keep new ones in that format; the serializer tests depend on it.

The folder layout mirrors OrcaSlicer's data folder, so the path tells you each profile's origin, vendor, and type.
