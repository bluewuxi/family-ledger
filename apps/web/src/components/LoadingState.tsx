import { useTranslation } from "react-i18next";
import { Cog } from "lucide-react";

export function LoadingState({ label }: { label?: string }) {
  const {t} = useTranslation("common");
  return (
    <span className="loading-state" role="status" aria-live="polite">
      <Cog className="loading-gear" size={21} strokeWidth={1.6} aria-hidden="true" />
      <span>{label ?? t("loading")}</span>
    </span>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="loading-block">
      <LoadingState label={label} />
    </div>
  );
}
