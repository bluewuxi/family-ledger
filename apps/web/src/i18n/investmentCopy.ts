import { i18n } from "./instance";
import type { UiLanguage } from "./language";
import dashboard from "./resources/en/dashboard";
import holdings from "./resources/en/holdings";
type ParametersIn<Text extends string> = Text extends `${string}{{${infer Key}}}${infer Rest}` ? Key | ParametersIn<Rest> : never;
type CopyArguments<Text extends string> = [ParametersIn<Text>] extends [never] ? [params?: never] : [params: Record<ParametersIn<Text>, string | number>];
// Resource key and interpolation contracts are checked at this presentation boundary.
// The internal adapter avoids i18next intersecting every union key's parameters.
export function dashboardCopy<Key extends keyof typeof dashboard>(key: Key, language: UiLanguage = "zh-CN", ...args: CopyArguments<(typeof dashboard)[Key]>): string {
  const translate = i18n.getFixedT(language, "dashboard") as unknown as (key: string, params?: object) => string;
  return translate(key, args[0]);
}
export function holdingsCopy<Key extends keyof typeof holdings>(key: Key, language: UiLanguage = "zh-CN", ...args: CopyArguments<(typeof holdings)[Key]>): string {
  const translate = i18n.getFixedT(language, "holdings") as unknown as (key: string, params?: object) => string;
  return translate(key, args[0]);
}
