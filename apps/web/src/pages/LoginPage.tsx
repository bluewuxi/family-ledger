export function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">family-ledger</p>
        <h1 id="login-title">家庭投资账务</h1>
        <p className="login-note">仅限家庭成员使用</p>

        <form className="login-form">
          <label>
            邮箱
            <input type="email" name="email" placeholder="name@example.com" autoComplete="email" />
          </label>
          <label>
            密码
            <input type="password" name="password" placeholder="请输入密码" autoComplete="current-password" />
          </label>
          <button type="button">登录</button>
        </form>
      </section>
    </main>
  );
}
