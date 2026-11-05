import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AccountCreateWorkspace } from "../components/AccountCreateWorkspace";
import "../styles.css";

// Isolated browser regression: this fixture has no API/auth clients or network writes.
function AccountCreateFixture() {
  const [submissions, setSubmissions] = useState(0);
  const [blocked,setBlocked]=useState(false);
  const [opening, setOpening] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) setSubmissions(value => value + 1);
  }
  return <main className="main-content app-shell" style={{ margin: "0 auto", maxWidth: 1100 }}>
    <p role="status" data-testid="submissions">Simulated submissions: {submissions}</p>
    <p>Regression: Next twice must show review with zero submissions. Only Confirm may increment the counter. No server writes exist in this fixture.</p>
    <button type="button" onClick={()=>setBlocked(true)}>Simulate partial account success</button>
    <AccountCreateWorkspace submitBlocked={blocked} open title="Isolated account creation" onClose={() => {}}>
      <form noValidate id="account-drawer-form" className="account-form drawer-form" onSubmit={submit}>
        <div className="account-basic-fields"><label>账户名称<input name="name" defaultValue="Isolated fixture" required /></label></div>
        <div className="account-opening-fields"><label className="checkbox-field"><input type="checkbox" checked={opening} onChange={event => setOpening(event.target.checked)} />同时录入期初资产</label>{opening ? <label>期初数量<input name="quantity" required /></label> : null}</div>
      </form>
    </AccountCreateWorkspace>
  </main>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><MemoryRouter><AccountCreateFixture /></MemoryRouter></StrictMode>);
