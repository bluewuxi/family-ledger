import { ApiRequestError } from "../utils/apiError";
export class AuthFailure extends ApiRequestError {
 constructor(code: "UNAUTHORIZED"|"FORBIDDEN"|"PASSWORD_CHANGE_REQUIRED"|"RATE_LIMITED"|"CONFLICT"|"DEPENDENCY_UNAVAILABLE", status: number, message: string, public readonly retryAfter?: number) { super(code,message,status); }
}
export const unavailable = () => new AuthFailure("DEPENDENCY_UNAVAILABLE",503,"认证服务暂时不可用，请稍后重试。");
export const invalidCredentials = () => new AuthFailure("UNAUTHORIZED",401,"邮箱或密码无效，或账户暂不可用。");
