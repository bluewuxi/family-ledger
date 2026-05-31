import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSupabaseClient } from "../lib/supabase";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password
    });

    setLoading(false);

    if (signInError) {
      setError("邮箱或密码不正确。");
      return;
    }

    navigate("/dashboard", { replace: true });
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand-lockup">
          <img className="brand-mark login-brand-mark" src="/icon-128x128.png" alt="" aria-hidden="true" />
          <div>
            <h1 className="brand-name login-brand-name" id="login-title" aria-label="小家大财">
              <span>小</span>
              <span>家</span>
              <span className="brand-name-emphasis">大</span>
              <span className="brand-name-gold">财</span>
            </h1>
            <p className="brand-subtitle login-brand-subtitle" aria-label="Family Ledger">
              <span>Family</span>
              <span>Ledger</span>
            </p>
          </div>
        </div>

        <p className="login-note">透明记录, 共同理解家庭财富变化</p>

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
          <label>
            密码
            <input
              type="password"
              name="password"
              placeholder="请输入密码"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
          <div className="login-form-footer">
            <p className="login-motto">聚沙成塔 - 资金永无眠</p>
            <Link className="login-secondary-link" to="/forgot-password">
              忘记密码？
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
