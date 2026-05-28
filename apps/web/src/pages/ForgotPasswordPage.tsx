import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const { error: resetError } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    setLoading(false);

    if (resetError) {
      setError("重置邮件发送失败，请确认邮箱并稍后重试。");
      return;
    }

    setNotice("如果该邮箱存在，Supabase 将发送密码重置邮件。");
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="forgot-password-title">
        <div className="login-brand-lockup">
          <img className="login-brand-mark" src="/icon-128x128.png" alt="" aria-hidden="true" />
          <div>
            <h1 id="forgot-password-title">重置密码</h1>
            <p className="login-brand-subtitle">
              <span>Family</span> Ledger
            </p>
          </div>
        </div>

        <p className="login-note">输入账户邮箱，系统会通过 Supabase 发送重置链接。</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            邮箱
            <input
              type="email"
              name="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {notice ? <p className="form-success">{notice}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "发送中..." : "发送重置邮件"}
          </button>
          <Link className="login-secondary-link" to="/login">
            返回登录
          </Link>
        </form>
      </section>
    </main>
  );
}
