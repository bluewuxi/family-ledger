import { i18n } from "../i18n/instance";
import { useUiLanguage } from "../i18n/LanguageProvider";
import { useRef, useState, type ReactNode } from "react";
import { PageBackLink } from "./PageBackLink";

interface Props { open: boolean; title: string; subtitle?: string; busy?: boolean; submitBlocked?: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode }
export function AccountCreateWorkspace({ children, busy, submitBlocked, onClose }: Props) {
  const { language } = useUiLanguage();
  const a = i18n.getFixedT(language, "accounts");
  const [step, setStep] = useState(1);
  const [invalid, setInvalid] = useState<"requiredField" | "invalidField" | null>(null);
  const content = useRef<HTMLDivElement>(null);
  function next() {
    const controls = content.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
    for (const control of controls ?? []) { if (control.getClientRects().length && !control.validity.valid) { setInvalid(control.validity.valueMissing ? "requiredField" : "invalidField"); control.focus(); return; } }
    setInvalid(null);
    setStep(value => Math.min(3, value + 1));
  }
  return <section className={"account-create-workspace account-create-step-" + step}>
    <PageBackLink to="/accounts" label={a("directory")} />
    <header className="page-header"><div><h1>{a("newHeading")}</h1><p>{a("workflowHelp")}</p></div></header>
    <ol className="workflow-steps" aria-label={a("progress")}>{[a("basicStep"), a("openingStep"), a("reviewStep")].map((label, index) => <li key={index} aria-current={step === index + 1 ? "step" : undefined}>{index + 1} {label}</li>)}</ol>
    {step === 3 ? <p className="form-warning">{a("reviewHelp")}</p> : null}
    {invalid ? <p role="alert" className="form-error">{a(invalid)}</p> : null}
    <div ref={content} onKeyDownCapture={event => { if (step < 3 && event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") { event.preventDefault(); next(); } }} onSubmitCapture={event => { if (step < 3) { event.preventDefault(); event.stopPropagation(); next(); } }}>{children}</div>
    <footer className="workflow-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{a("cancel")}</button>
      {step > 1 ? <button type="button" className="secondary-button" disabled={busy} onClick={() => setStep(step - 1)}>{a("previous")}</button> : null}
      {step < 3 ? <button key="advance" type="button" className="primary-button" disabled={busy} onClick={event => { event.preventDefault(); next(); }}>{a("next")}</button> : <button key="confirm" className="primary-button" type="submit" form="account-drawer-form" disabled={busy || submitBlocked}>{busy ? a("savingStep") : submitBlocked ? a("createdReturn") : a("confirmCreate")}</button>}
    </footer>
  </section>;
}
