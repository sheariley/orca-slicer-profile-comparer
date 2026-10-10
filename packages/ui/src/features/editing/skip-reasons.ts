import type { SkipReason } from '@comparer/core';

/** Why a copy leaves a setting alone, in words (for previews and notices). */
export function skipReasonText(reason: SkipReason, targetName: string): string {
  switch (reason) {
    case 'already-equal':
      return `${targetName} already has this value.`;
    case 'missing-in-source':
      return 'The source preset has no value for it.';
    case 'not-owned':
      return "OrcaSlicer doesn't use this setting in this kind of preset.";
    case 'metadata':
      return 'It describes the preset file, not a setting.';
    case 'variant-list':
      return 'It defines the extruder variants, so it is never copied.';
  }
}
