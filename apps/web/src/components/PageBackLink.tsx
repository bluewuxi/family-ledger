import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function PageBackLink({ to, label }: { to: string; label: string }) {
  const {t} = useTranslation("common");
  return <Link className="page-back-link" to={to} aria-label={t("back", {destination:label})}>
    <ArrowLeft size={16} aria-hidden="true" />
    <span>{label}</span>
  </Link>;
}
