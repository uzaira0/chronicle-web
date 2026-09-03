// Option builders: every selectable option carries the ENGLISH canonical `value`
// (what gets submitted) and the localized `label` (what the participant sees). This
// is the mechanism that lets the submit builder skip back-translation — the stored
// answer is already English. For Hebrew, weekday options are reordered via
// ARRAY_ORDER_PERMUTATIONS so the localized Sunday-first list maps to the right
// English weekday.
import { ARRAY_ORDER_PERMUTATIONS } from '@/i18n/language-codes';
import type { Translator, TransOptions } from '@/i18n/translator';

export interface TudOption {
  value: string; // english canonical (submitted)
  label: string; // localized (displayed)
}

export interface OptionContext {
  translator: Translator; // localized labels
  enTranslator: Translator; // english canonical values
  effectiveCode: string;
}

/** Build options from an array-valued translation key (e.g. caregiver_options). */
export function optionsFromArray(ctx: OptionContext, optionsKey: string, trans: TransOptions = {}): TudOption[] {
  const labels = ctx.translator.tArray(optionsKey, trans);
  const english = ctx.enTranslator.tArray(optionsKey, trans);
  const perm = ARRAY_ORDER_PERMUTATIONS[ctx.effectiveCode]?.[optionsKey];
  return labels.map((label, index) => {
    const enIndex = perm?.[index] ?? index;
    return { label, value: english[enIndex] ?? label };
  });
}

/** Build options from an object-valued translation key (primary_activities). */
export function optionsFromObject(ctx: OptionContext, optionsKey: string): TudOption[] {
  const labels = ctx.translator.tObject(optionsKey);
  const english = ctx.enTranslator.tObject(optionsKey);
  return Object.keys(english).map((key) => {
    const value = english[key] ?? key;
    return { label: labels[key] ?? value, value };
  });
}

/** Build a small option list from individual string keys (e.g. yes/no/dont_know). */
export function optionsFromKeys(ctx: OptionContext, keys: string[]): TudOption[] {
  return keys.map((key) => ({ label: ctx.translator.t(key), value: ctx.enTranslator.t(key) }));
}

/** Localized label for an english canonical activity value (for {{activity}} interpolation). */
export function activityLabel(ctx: OptionContext, englishActivity: string | undefined): string {
  if (!englishActivity) return '';
  const match = optionsFromObject(ctx, 'primary_activities').find((o) => o.value === englishActivity);
  return match?.label ?? englishActivity;
}
