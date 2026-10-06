import {
  METADATA_KEYS,
  type PresetRef,
  type ProfileDocument,
  type ProfileType,
  type RawValue,
} from '../model/profile.ts';
import { valuesEqual, type NormalizedValue } from '../normalize/normalize-value.ts';
import type { KeyRules } from '../ports/ports.ts';
import type { ResolvedProfile } from '../resolve/resolve-chain.ts';

/**
 * The setting that lists a preset's extruder variants (e.g. "Direct Drive Standard",
 * "Direct Drive High Flow"), per type. It defines the shape of every per-variant array, so
 * copies never change it.
 */
export const VARIANT_LIST_KEYS: Readonly<Partial<Record<ProfileType, string>>> = {
  filament: 'filament_extruder_variant',
  process: 'print_extruder_variant',
};

/** Everything planTransfer needs to know about one target. */
export interface TransferTarget {
  /** The target's own file content: the overrides it sets itself. */
  readonly document: ProfileDocument;
  /** The target with its inheritance chain applied. */
  readonly resolved: ResolvedProfile;
  /**
   * What the target would have without its own overrides: its parent's resolved settings, or
   * the built-in defaults for a root preset.
   */
  readonly inherited: ResolvedProfile['settings'];
  readonly rules: KeyRules;
}

export type SkipReason =
  /** A key that describes the file, not a setting (METADATA_KEYS). */
  | 'metadata'
  /** The variant list itself (VARIANT_LIST_KEYS). */
  | 'variant-list'
  /** A setting the target's preset type doesn't own (e.g. a process setting on a filament). */
  | 'not-owned'
  /** The source has no value for the key. */
  | 'missing-in-source'
  /** The target already has the value. */
  | 'already-equal';

export type Change =
  { readonly kind: 'set'; readonly value: RawValue } | { readonly kind: 'remove' };

export interface KeyChange {
  readonly key: string;
  readonly change: Change;
}

export interface KeySkip {
  readonly key: string;
  readonly reason: SkipReason;
}

export interface TargetPlan {
  readonly target: PresetRef;
  readonly changes: readonly KeyChange[];
  readonly skipped: readonly KeySkip[];
}

export interface TransferPlan {
  readonly targets: readonly TargetPlan[];
}

/**
 * Plans copying `keys` from `source` to each target. One code path serves one setting or many,
 * and one target or many. Per target and key:
 * - metadata keys, the variant list, settings the target's type doesn't own, and keys the
 *   source lacks are skipped, with the reason;
 * - per-variant settings are fitted to the target's variants (see fitToVariants);
 * - a value the target already has is skipped;
 * - a value equal to what the target would inherit removes the target's own override instead of
 *   writing a redundant one;
 * - otherwise the value is set, in the shape (array or plain string) the target uses.
 */
export function planTransfer(
  source: ResolvedProfile,
  keys: readonly string[],
  targets: readonly TransferTarget[],
): TransferPlan {
  return { targets: targets.map((target) => planTarget(source, keys, target)) };
}

function planTarget(
  source: ResolvedProfile,
  keys: readonly string[],
  target: TransferTarget,
): TargetPlan {
  const changes: KeyChange[] = [];
  const skipped: KeySkip[] = [];
  const type = target.resolved.ref.type;
  const variantListKey = VARIANT_LIST_KEYS[type];

  for (const key of keys) {
    const reason = ruleOut(key, target.rules, variantListKey);
    const sourceSetting = source.settings.get(key);
    if (reason || !sourceSetting) {
      skipped.push({ key, reason: reason ?? 'missing-in-source' });
      continue;
    }

    const value = target.rules.perVariant.has(key)
      ? fitToVariants(
          sourceSetting.value,
          variantsOf(source, VARIANT_LIST_KEYS[source.ref.type]),
          variantsOf(target.resolved, variantListKey),
        )
      : sourceSetting.value;

    const current = target.resolved.settings.get(key);
    if (current && valuesEqual(value, current.value)) {
      skipped.push({ key, reason: 'already-equal' });
      continue;
    }

    const inherited = target.inherited.get(key);
    if (inherited && valuesEqual(value, inherited.value) && key in target.document.content) {
      changes.push({ key, change: { kind: 'remove' } });
      continue;
    }

    const isVector = current?.isVector ?? sourceSetting.isVector;
    changes.push({ key, change: { kind: 'set', value: isVector ? value : (value[0] ?? '') } });
  }

  return { target: target.resolved.ref, changes, skipped };
}

/** Keys that are never copied to this target, whatever the values. */
function ruleOut(
  key: string,
  rules: KeyRules,
  variantListKey: string | undefined,
): SkipReason | undefined {
  if (METADATA_KEYS.has(key)) return 'metadata';
  if (key === variantListKey) return 'variant-list';
  if (rules.owned.size > 0 && !rules.owned.has(key)) return 'not-owned';
  return undefined;
}

function variantsOf(
  profile: ResolvedProfile,
  key: string | undefined,
): NormalizedValue | undefined {
  return key === undefined ? undefined : profile.settings.get(key)?.value;
}

/**
 * Fits a per-variant array to the target's variants.
 * - When both presets name their variants and the source has every one the target has, values
 *   are matched by name, so a "High Flow" value never lands in a "Standard" slot.
 * - Otherwise it's resized the way OrcaSlicer resizes these arrays when it loads a preset
 *   (`extend_default_config_length` → `ConfigOptionVector::resize`): truncated, or padded by
 *   repeating the first value. A preset without a variant list has one variant.
 */
export function fitToVariants(
  value: NormalizedValue,
  sourceVariants: NormalizedValue | undefined,
  targetVariants: NormalizedValue | undefined,
): NormalizedValue {
  if (sourceVariants && targetVariants && value.length === sourceVariants.length) {
    const indexes = targetVariants.map((name) => sourceVariants.indexOf(name));
    if (indexes.every((index) => index >= 0)) return indexes.map((index) => value[index]!);
  }
  const length = targetVariants?.length ?? 1;
  const first = value[0];
  if (first === undefined) return value;
  return value.length >= length
    ? value.slice(0, length)
    : [...value, ...Array<string>(length - value.length).fill(first)];
}
