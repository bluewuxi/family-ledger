import { useRef, useState, type ReactNode } from "react";
import { PageBackLink } from "./PageBackLink";

interface Props { open: boolean; title: string; subtitle?: string; busy?: boolean; submitBlocked?: boolean; onClose: () => void; footer?: ReactNode; children: ReactNode }
export function AccountCreateWorkspace({ children, busy, submitBlocked, onClose }: Props) {
  const [step, setStep] = useState(1);
  const content = useRef<HTMLDivElement>(null);
  function next() {
    const controls = content.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
    for (const control of controls ?? []) if (control.getClientRects().length && !control.reportValidity()) return;
    setStep(value => Math.min(3, value + 1));
  }
  return <section className={"account-create-workspace account-create-step-" + step}>
    <PageBackLink to="/accounts" label="账户管理" />
    <header className="page-header"><div><h1>新建账户</h1><p>先填写账户信息，再录入期初资产并核对。</p></div></header>
    <ol className="workflow-steps" aria-label="创建进度">{["基本信息", "期初资产", "核对并创建"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1} {label}</li>)}</ol>
    {step === 3 ? <p className="form-warning">请核对以下信息。账户与期初资产分次保存；若部分失败，请按提示检查已创建记录。</p> : null}
    <div ref={content} onKeyDownCapture={event => { if (step < 3 && event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox") { event.preventDefault(); next(); } }} onSubmitCapture={event => { if (step < 3) { event.preventDefault(); event.stopPropagation(); next(); } }}>{children}</div>
    <footer className="workflow-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>取消</button>
      {step > 1 ? <button type="button" className="secondary-button" disabled={busy} onClick={() => setStep(step - 1)}>上一步</button> : null}
      {step < 3 ? <button key="advance" type="button" className="primary-button" disabled={busy} onClick={event => { event.preventDefault(); next(); }}>下一步</button> : <button key="confirm" className="primary-button" type="submit" form="account-drawer-form" disabled={busy || submitBlocked}>{busy ? "保存中…" : submitBlocked ? "账户已创建，请返回检查" : "确认创建"}</button>}
    </footer>
  </section>;
}
