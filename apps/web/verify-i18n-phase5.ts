import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transform } from "esbuild";
import type * as Policy from "./src/i18n/language";

const englishPreview = readFileSync("apps/web/src/i18n/resources/en/preview.ts", "utf8");
assert(!englishPreview.includes("business pages remain in Chinese"), "Preview notice must describe integrated gated coverage");
const source = readFileSync("apps/web/src/i18n/language.ts", "utf8");
assert.match(source, /export const ordinaryUiLanguageReleased = true;/, "The local release candidate must enable ordinary switching");
for (const released of [false, true]) {
  const code = await transform(source.replace(/ordinaryUiLanguageReleased = true/, `ordinaryUiLanguageReleased = ${released}`), { loader: "ts", format: "cjs" });
  const module = { exports: {} as typeof Policy };
  new Function("module", "exports", code.code)(module, module.exports);
  for (const dev of [false, true]) for (const host of ["localhost", "127.0.0.1", "[::1]", "example.com", "localhost.example.com", "::1", ""]) {
    const preview = dev && ["localhost", "127.0.0.1", "[::1]"].includes(host);
    assert.equal(module.exports.isLocalLanguagePreview(dev, host), preview);
    assert.equal(module.exports.isUiLanguageEnabled(dev, host), released || preview);
    const writes: string[] = [];
    const store = module.exports.createLanguageStore({ enabled: module.exports.isUiLanguageEnabled(dev, host), getStorage: () => ({ getItem: () => "en", setItem: (_, value) => { writes.push(value); } }) });
    await store.initialize();
    assert.equal(store.getLanguage(), released || preview ? "en" : "zh-CN");
    await store.setLanguage("zh-CN");
    await store.setLanguage("en");
    assert.equal(store.getLanguage(), released || preview ? "en" : "zh-CN");
    assert.deepEqual(writes, released || preview ? ["zh-CN", "en"] : []);
  }
}
console.log("Phase 5 disabled/enabled release policy, exact-loopback fixture isolation and preference preservation passed.");
