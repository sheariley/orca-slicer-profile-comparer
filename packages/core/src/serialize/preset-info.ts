/**
 * OrcaSlicer's `.info` file, written next to every user preset (`Preset::save_info` in
 * Preset.cpp). It's an INI-style list of cloud-sync bookkeeping, one `key = value` per line:
 *
 *   sync_info = update        what the sync service should do next ("", create, update, ...)
 *   user_id = <account id>
 *   setting_id = <cloud id>
 *   base_id = <parent's id>
 *   updated_time = <epoch s>  compared with the cloud copy's time when pulling
 *
 * When OrcaSlicer saves an edited preset, it sets `sync_info` to "update" (Tab.cpp), which
 * queues the change for upload. A preset whose `.json` changes while its `.info` doesn't would
 * never be uploaded, and a newer cloud copy could later overwrite it, so the comparer marks it
 * the same way.
 */

/** The sync states that must survive an edit: a preset not created in the cloud yet stays "create". */
const KEEP: ReadonlySet<string> = new Set(['create', 'delete']);

/**
 * Marks a preset's `.info` text so OrcaSlicer uploads the edit: `sync_info` becomes "update"
 * unless it's "create" (not uploaded yet) or "delete". Every other byte is kept, including the
 * file's line endings. Returns the text unchanged when there's nothing to change.
 */
export function markPresetInfoForSync(infoText: string): string {
  const line = /^sync_info[ \t]*=[ \t]*(.*?)[ \t]*(\r?)$/m.exec(infoText);
  if (!line) {
    const newline = infoText.includes('\r\n') ? '\r\n' : '\n';
    return `sync_info = update${newline}${infoText}`;
  }
  if (KEEP.has(line[1]!) || line[1] === 'update') return infoText;
  return (
    infoText.slice(0, line.index) +
    `sync_info = update${line[2]}` +
    infoText.slice(line.index + line[0].length)
  );
}
