import assert from "node:assert/strict";
import { resources } from "./src/i18n/resources";
import { validateResources, type ResourceDiagnostic } from "./src/i18n/resourceValidation";

assert.deepEqual(validateResources(resources), []);
type MutableResources = Record<string, Record<string, Record<string, unknown>>>;
function mutation(change: (value: MutableResources) => void, expected: ResourceDiagnostic) {
  const value = structuredClone(resources) as MutableResources; change(value);
  assert(validateResources(value).some(d => JSON.stringify(d) === JSON.stringify(expected)), `Expected ${JSON.stringify(expected)}; got ${JSON.stringify(validateResources(value))}`);
}
mutation(r => { delete r.en.common.productName; }, {language:"en",namespace:"common",key:"productName",rule:"missing"});
mutation(r => { r.en.common.extra = "extra"; }, {language:"zh-CN",namespace:"common",key:"extra",rule:"missing"});
mutation(r => { r.en.common.productName = " \n "; }, {language:"en",namespace:"common",key:"productName",rule:"empty"});
mutation(r => { r.en.common.productName = {nested:"wrong"}; }, {language:"en",namespace:"common",key:"productName",rule:"shape"});
mutation(r => { r.en.format.localTimeNote = "{{amount}} (local time)"; }, {language:"en",namespace:"format",key:"localTimeNote",rule:"interpolation"});
for (const token of ["{{amount, number}}", "{{- amount}}", "{{account.amount}}", "{{amount", "{{}}"])
  mutation(r => { r.en.format.localTimeNote = `{{value}} (local time) ${token}`; }, {language:"en",namespace:"format",key:"localTimeNote",rule:"interpolation"});
mutation(r => { delete r.en.preview.sampleCount_one; }, {language:"en",namespace:"preview",key:"sampleCount_one",rule:"plural"});
mutation(r => { r.en.preview.sampleCount_few = "{{count}} samples"; }, {language:"en",namespace:"preview",key:"sampleCount_few",rule:"plural"});
mutation(r => { r.en.preview.sampleCount_one = "one sample"; }, {language:"en",namespace:"preview",key:"sampleCount_one",rule:"interpolation"});
mutation(r => { r.en.unknown = {}; }, {language:"en",namespace:"unknown",key:"",rule:"shape"});
mutation(r => { delete r.en.format; }, {language:"en",namespace:"format",key:"",rule:"missing"});
for (const invalid of [null, [], "wrong", {en:[]}, {...resources, fr:{}}]) assert(validateResources(invalid).length > 0);
const optional = structuredClone(resources) as MutableResources;
optional.en.preview.sampleCount_zero = "{{count}} samples";
assert.deepEqual(validateResources(optional), []);
optional.en.preview.sampleCount_zero = "{{amount}} samples";
assert(validateResources(optional).some(d => d.key === "sampleCount_zero" && d.rule === "interpolation"));
const nested = structuredClone(resources) as MutableResources;
nested.en.common.nested = {sentence:"Sample {{value}}"}; nested["zh-CN"].common.nested = {sentence:"示例 {{value}}"};
assert.deepEqual(validateResources(nested), []);
delete (nested.en.common.nested as Record<string,unknown>).sentence;
assert(validateResources(nested).some(d => d.key === "nested.sentence" && d.rule === "missing"));
console.log("Raw-resource shape/key/empty/interpolation/cardinal-plural mutation fixtures passed");
