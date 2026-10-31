import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../lib/authClient";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await login(email, password);
      navigate(session.mustChangePassword ? "/change-password" : "/dashboard", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录暂时不可用，请稍后重试。");
    } finally { setPassword(""); setLoading(false); }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand-lockup">
          <img className="brand-mark login-brand-mark" src="/icon-128x128.png" alt="" aria-hidden="true" />
          <div>
            <h1 className="brand-name login-brand-name" id="login-title" aria-label="金财屋">
              <span className="brand-name-gold">金</span>
              <span>财</span>
              <span className="brand-name-emphasis">屋</span>
            </h1>
            <p className="brand-subtitle login-brand-subtitle" aria-label="Family Ledger">
              <span>Family</span>
              <span>Ledger</span>
            </p>
          </div>
        </div>

        <p className="login-note">透明记录, 共同理解家庭财富变化</p>
        {params.has("passwordChanged") && <p role="status">密码已修改，请使用新密码登录。</p>}
        {params.has("logoutUnconfirmed") && <p className="form-error" role="alert">本机已退出，服务器会话撤销未确认。请联系管理员或稍后重试。</p>}

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
          {error ? <p className="form-error" role="alert">{error}</p> : null}
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
