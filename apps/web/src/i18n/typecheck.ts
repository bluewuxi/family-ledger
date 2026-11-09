import type { TFunction } from "i18next";

// Compile-only contract; never imported by application startup.
export function checkTranslationKeys(t: TFunction<["common", "format", "preview", "auth", "navigation", "errors", "investmentGroups", "investment", "dashboard", "holdings", "monthlyReview", "accounts", "instruments", "transactions"]>): void {
  t("productName");
  t("monthlyReview:requestedBoundaries", {start:"2026-01-01",end:"2026-01-31"});
  t("transactions:pagination", {total:2,page:1,pages:1});
  // @ts-expect-error Phase 3 interpolation parameters are required.
  t("monthlyReview:requestedBoundaries", {});
  // @ts-expect-error Unknown investment resource keys must not compile.
  t("investment:invalidInvestmentKey");
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

import { getInvestmentLabel } from "./investmentLabels";
export function checkInvestmentLabels(): void {
 getInvestmentLabel("accountType", "bank", "en");
 // @ts-expect-error Values belong to their discriminated enum kind.
 getInvestmentLabel("accountType", "buy", "en");
}
