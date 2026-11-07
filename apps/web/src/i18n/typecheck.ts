import type { TFunction } from "i18next";

// Compile-only contract; never imported by application startup.
export function checkTranslationKeys(t: TFunction<["common", "format", "preview", "auth", "navigation", "errors", "investmentGroups"]>): void {
  t("productName");
  t("auth:login"); t("navigation:dashboard"); t("errors:groupConflict"); t("investmentGroups:create");
  // @ts-expect-error Unknown Phase 2 keys must not compile.
  t("investmentGroups:missingGroupKey");
  t("format:localTimeNote", { value: "sample" });
  t("preview:sampleCount", { count: 2 });
  // @ts-expect-error Unknown semantic keys must not compile.
  t("missingKey");
  // @ts-expect-error Unknown namespaces must not compile.
  t("unknown:productName");
}
