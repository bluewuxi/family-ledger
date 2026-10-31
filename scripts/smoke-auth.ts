import { emitKeypressEvents } from "node:readline";

/** Interactive credentials only: do not put test passwords in shell arguments or env files. */
export async function promptSmokePassword(email: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Smoke authentication requires an interactive terminal.");
  process.stdout.write(`Password for ${email}: `);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") { finish(); reject(new Error("Authentication cancelled.")); }
      else if (key.name === "return") { finish(); resolve(value); }
      else if (key.name === "backspace") value = [...value].slice(0, -1).join("");
      else if (text && !key.ctrl) value += text;
    };
    process.stdin.on("keypress", onKey);
  });
}

export async function loginSmokeUser(baseUrl: string, email: string): Promise<string> {
  const password = await promptSmokePassword(email);
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const result = await response.json() as { success: boolean; data?: { token: string; mustChangePassword: boolean } };
  if (!response.ok || !result.success || !result.data?.token) throw new Error("Smoke login failed.");
  if (result.data.mustChangePassword) {
    await logoutSmokeUser(baseUrl, result.data.token);
    throw new Error("Complete the required password change in the app before running the smoke check.");
  }
  return result.data.token;
}

export async function logoutSmokeUser(baseUrl: string, token: string): Promise<void> {
  const response = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Smoke session revocation failed.");
}
