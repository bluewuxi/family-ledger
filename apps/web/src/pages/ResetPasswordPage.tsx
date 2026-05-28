import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCurrentSession, getSupabaseClient } from "../lib/supabase";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    getCurrentSession()
      .then((session) => {
        if (mounted) {
          setHasRecoverySession(Boolean(session));
        }
      })
      .catch(() => {
        if (mounted) {
          setHasRecoverySession(false);
        }
      })
      .finally(() => {
        if (mounted) {
          setCheckingSession(false);
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasRecoverySession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 8) {
      setError("密码至少需要 8 位。");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setLoading(true);
    const { error: updateError } = await getSupabaseClient().auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("密码更新失败，请重新打开重置邮件中的链接。");
      return;
    }

    setNotice("密码已更新，请使用新密码登录。");
    await getSupabaseClient().auth.signOut();
    window.setTimeout(() => navigate("/login", { replace: true }), 900);
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="reset-password-title">
        <div className="login-brand-lockup">
          <img className="login-brand-mark" src="/icon-128x128.png" alt="" aria-hidden="true" />
          <div>
            <h1 id="reset-password-title">设置新密码</h1>
            <p className="login-brand-subtitle">
              <span>Family</span> Ledger
            </p>
          </div>
        </div>

        {checkingSession ? <p className="login-note">正在验证重置链接。</p> : null}

        {!checkingSession && !hasRecoverySession ? (
          <>
            <p className="login-note">重置链接无效或已过期，请重新发送密码重置邮件。</p>
            <Link className="login-secondary-link" to="/forgot-password">
              重新发送重置邮件
            </Link>
          </>
        ) : null}

        {!checkingSession && hasRecoverySession ? (
          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              新密码
              <input
                type="password"
                name="password"
                placeholder="至少 8 位"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label>
              确认新密码
              <input
                type="password"
                name="confirmPassword"
                placeholder="再次输入新密码"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            {notice ? <p className="form-success">{notice}</p> : null}
            <button type="submit" disabled={loading}>
              {loading ? "保存中..." : "更新密码"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
