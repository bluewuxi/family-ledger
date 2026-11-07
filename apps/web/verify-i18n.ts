import assert from "node:assert/strict";
import { createLanguageStore, languageStorageKey, isLocalLanguagePreview, parseUiLanguage, getDisplayLocale } from "./src/i18n/language";
import * as numbers from "./src/lib/numberFormat";
import { formatSpendingAmount } from "./src/lib/spendingFormat";
import * as time from "./src/lib/timeFormat";
import { formatDateTimeInTimeZone, getAppBusinessDate, getAppBusinessDayEndInstant } from "@family-ledger/shared";

// Preserve observed Chinese behavior before introducing explicit locales.
assert.equal(numbers.formatDisplayPrice("1.23456"), "1.2346");
assert.equal(numbers.formatDisplayAmount("1.23456"), "1.235");
assert.equal(numbers.formatDisplayPercent(12.34), "12.3");
assert.equal(numbers.formatSignedDisplayPercent(0.01), "0.0");
assert.equal(numbers.formatSignedDisplayAmount(-0.0001), "0");
assert.equal(numbers.formatDisplayWholeAmount(-0.1), "0");
assert.equal(numbers.formatDisplayAmount(-0.0001), "-0");
assert.equal(numbers.formatDisplayPercent(-0.001), "-0.0");
for (const helper of Object.values(numbers)) {
  assert.equal(helper(null), "--"); assert.equal(helper("  "), "--");
  assert.equal(helper("invalid"), "invalid");
}
assert.equal(formatSpendingAmount("9007199254740993.1200"), "9,007,199,254,740,993.12");
assert.equal(formatSpendingAmount(null), "—");
for (const value of [null, undefined, "", "en-NZ", "fr", {}, 1]) assert.equal(parseUiLanguage(value), null);
assert.equal(parseUiLanguage("en"), "en"); assert.equal(parseUiLanguage("zh-CN"), "zh-CN");
assert.equal(getDisplayLocale("en"), "en-NZ"); assert.equal(getDisplayLocale("zh-CN"), "zh-CN");
for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
  assert.equal(isLocalLanguagePreview(true, hostname), true, "Loopback DEV preview must be eligible");
  assert.equal(isLocalLanguagePreview(false, hostname), false);
}
for (const hostname of ["example.com", "localhost.example.com", "::1", "127.0.0.2", ""]) assert.equal(isLocalLanguagePreview(true, hostname), false);
for (const stored of [null, "", "fr", "en-NZ", "zh-CN", "en"]) {
  let reads = 0;
  const writes: string[] = [];
  const store = createLanguageStore({ preview: true, getStorage: () => ({
    getItem: key => { assert.equal(key, languageStorageKey); reads++; return stored; },
    setItem: (key, value) => { assert.equal(key, languageStorageKey); writes.push(value); }
  }) });
  const first = store.initialize(); assert.equal(store.initialize(), first);
  await first; assert.equal(reads, 1);
  assert.equal(store.getLanguage(), stored === "en" ? "en" : "zh-CN");
  let changes = 0; const unsubscribe = store.subscribe(() => { changes++; });
  await Promise.all([store.setLanguage("en"), store.setLanguage("zh-CN"), store.setLanguage("en")]);
  assert.equal(store.getLanguage(), "en"); assert.equal(writes.at(-1), "en");
  assert(changes >= 2); unsubscribe(); const before = changes;
  await store.setLanguage("zh-CN"); assert.equal(changes, before);
}
for (const preview of [false, true]) {
  for (const failure of ["getter", "read", "write"]) {
    const store = createLanguageStore({preview, getStorage: () => {
      if (failure === "getter") throw new Error("Storage getter denied");
      return {getItem: () => {if (failure === "read") throw new Error("Read denied"); return "en";}, setItem: () => {throw new Error("Write denied");}};
    }});
    await store.initialize();
    assert.equal(store.getLanguage(), preview && failure === "write" ? "en" : "zh-CN");
    await store.setLanguage("en"); assert.equal(store.getLanguage(), preview ? "en" : "zh-CN");
  }
}
const production = createLanguageStore({preview:false,getStorage:()=>({getItem:()=>"en",setItem:()=>{assert.fail("Gate must not delete or overwrite saved preference");}})});
await production.initialize(); await production.setLanguage("en"); assert.equal(production.getLanguage(), "zh-CN");
const noBrowser = createLanguageStore({preview:true,getStorage:()=>window.localStorage});
await noBrowser.initialize(); assert.equal(noBrowser.getLanguage(), "zh-CN");
for (const locale of ["zh-CN", "en-NZ"] as const) {
  assert.equal(numbers.formatDisplayPrice("1234.23456", locale), "1,234.2346");
  assert.equal(numbers.formatDisplayAmount("1234.23456", locale), "1,234.235");
  assert.equal(numbers.formatSignedDisplayAmount(1234.23456, locale), "+1,234.235");
  assert.equal(numbers.formatDisplayWholeAmount(-0.1, locale), "0");
  assert.equal(numbers.formatSignedDisplayWholeAmount(1234.8, locale), "+1,235");
  assert.equal(numbers.formatDisplayPercent(12.34, locale), "12.3");
  assert.equal(numbers.formatSignedDisplayPercent(-0.01, locale), "0.0");
  for (const helper of Object.values(numbers)) {
    assert.equal(helper(null, locale), "--"); assert.equal(helper("  ", locale), "--");
    assert.equal(helper("invalid", locale), "invalid");
  }
}
assert.equal(time.formatHoursMinutes(201), "03小时 21分");
assert.equal(time.formatHoursMinutes(201, "en"), "03h 21m");
for (const language of ["zh-CN", "en"] as const) {
  for (const zone of ["Pacific/Auckland", "Asia/Shanghai", "UTC"]) {
    for (const instant of ["2026-04-04T13:59:59Z", "2026-04-04T14:00:00Z", "2026-09-26T13:59:59Z", "2026-09-26T14:00:00Z", "2025-12-31T23:59:59Z"]) {
      assert.equal(time.formatLocalDateTime(instant, "-", zone, language), formatDateTimeInTimeZone(instant, zone, getDisplayLocale(language), instant));
    }
  }
  assert.equal(time.formatLocalDateTime(null, "missing", "UTC", language), "missing");
  assert.equal(time.formatLocalDateTime("invalid", "-", "UTC", language), "invalid");
  assert.equal(time.formatLocalDateTimeNote(null, "missing", language), "missing");
  const timestamp = time.formatLocalDateTime("2026-05-28T00:30:00Z", "-", undefined, language);
  assert.equal(time.formatLocalDateTimeNote("2026-05-28T00:30:00Z", "-", language), language === "en" ? `${timestamp} (local time)` : `${timestamp}（本地时间）`);
  for (const [instant, date, duration] of [["2026-05-27T21:59:59Z", "2026-05-27", 1], ["2026-05-27T22:00:00Z", "2026-05-28", 1440]] as const) {
    const now = new Date(instant);
    assert.equal(getAppBusinessDate(now), date);
    const end = getAppBusinessDayEndInstant(now);
    assert.equal(time.formatAppBusinessDayCountdown(now, language), language === "en" ? `Business day ${date} ends in ${time.formatHoursMinutes(duration, language)}` : `交易日 ${date} 将于 ${time.formatHoursMinutes(duration)} 结束`);
    assert.equal(getAppBusinessDayEndInstant(now), end);
  }
  assert.equal(time.formatCalendarDate(null, "missing", language), "missing");
  for (const invalid of ["2025-02-29", "2024-02-30", "2024-13-01", "2024-00-01", "2024-01-00", "invalid"]) assert.equal(time.formatCalendarDate(invalid, "-", language), invalid);
}
for (const [date, english] of [["2024-02-29", "29 Feb 2024"], ["2025-12-31", "31 Dec 2025"], ["2026-01-01", "01 Jan 2026"]]) {
  assert.equal(time.formatCalendarDate(date), date); assert.equal(time.formatCalendarDate(date, "-", "en"), english);
}
console.log("i18n lifecycle/gate and both-locale financial/time invariants passed");
