import type { TFunction } from "i18next";

// Compile-only contract; never imported by application startup.
export function checkTranslationKeys(t: TFunction<["common", "format", "preview"]>): void {
  t("productName");
  t("format:localTimeNote", { value: "sample" });
  t("preview:sampleCount", { count: 2 });
  // @ts-expect-error Unknown semantic keys must not compile.
  t("missingKey");
  // @ts-expect-error Unknown namespaces must not compile.
  t("unknown:productName");
}
