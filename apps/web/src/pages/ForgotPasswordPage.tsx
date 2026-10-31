import { Link } from "react-router-dom";
export function ForgotPasswordPage() {
  return <main className="login-page"><section className="login-panel"><h1>忘记密码</h1><p className="login-note">请联系管理员重置登录密码。重置后，请使用临时密码登录并设置新密码。</p><Link className="login-secondary-link" to="/login">返回登录</Link></section></main>;
}
