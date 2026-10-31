import { createHash } from "node:crypto";
import { AuthFailure } from "./authErrors";
export interface RateStore { consumeAttempt(key: string, limit: number, expiresAt: number): Promise<boolean>; }
export async function enforceRate(store: RateStore, dimension: string, value: string, limit: number, now = Math.floor(Date.now()/1000)): Promise<void> {
 const window = Math.floor(now/900);
 const expiresAt = (window+1)*900;
 const key = `RATE#${dimension}#${createHash("sha256").update(value).digest("hex")}#${window}`;
 if (!await store.consumeAttempt(key,limit,expiresAt)) throw new AuthFailure("RATE_LIMITED",429,"尝试次数过多，请稍后重试。",expiresAt-now);
}
