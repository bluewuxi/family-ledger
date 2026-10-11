import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function PageBackLink({ to, label }: { to: string; label: string }) {
  return <Link className="page-back-link" to={to} aria-label={`返回${label}`}>
    <ArrowLeft size={16} aria-hidden="true" />
    <span>{label}</span>
  </Link>;
}
