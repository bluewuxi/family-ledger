export interface ResourceDiagnostic {
  language: string; namespace: string; key: string;
  rule: "shape" | "missing" | "empty" | "interpolation" | "plural";
}
type Dictionary = Record<string, unknown>;
const languages = ["zh-CN", "en"] as const;
const namespaces = ["common","format","preview","auth","navigation","errors","investmentGroups","investment","dashboard","holdings","monthlyReview","accounts","instruments","transactions","cashflow","spending","spendingImport","educationReserve","settings","maintenance","about"];
const record = (value: unknown): value is Dictionary => value !== null && typeof value === "object" && !Array.isArray(value);
const parameters = (value: string): string => [...new Set([...value.matchAll(/{{\s*([A-Za-z][\w]*)\s*}}/g)].map(m => m[1]))].sort().join(",");
// Phase 1 permits plain named text parameters only. Reject, rather than ignore,
// i18next formatting/unescaped/path syntax and incomplete interpolation tokens.
const unsupportedInterpolation = (value: string): boolean => /{{|}}/.test(value.replace(/{{\s*[A-Za-z][\w]*\s*}}/g, ""));

export function validateResources(resources: unknown): ResourceDiagnostic[] {
  const diagnostics: ResourceDiagnostic[] = [];
  const add = (language: string, namespace: string, key: string, rule: ResourceDiagnostic["rule"]) => {
    if (!diagnostics.some(d => d.language === language && d.namespace === namespace && d.key === key && d.rule === rule)) diagnostics.push({language, namespace, key, rule});
  };
  if (!record(resources)) return [{language:"",namespace:"",key:"",rule:"shape"}];
  for (const language of Object.keys(resources)) if (!languages.includes(language as typeof languages[number])) add(language, "", "", "shape");
  for (const language of languages) {
    const value = resources[language];
    if (!record(value)) { add(language, "", "", value === undefined ? "missing" : "shape"); continue; }
    for (const namespace of Object.keys(value)) if (!namespaces.includes(namespace)) add(language, namespace, "", "shape");
    for (const namespace of namespaces) {
      if (!record(value[namespace])) add(language, namespace, "", value[namespace] === undefined ? "missing" : "shape");
    }
  }
  function walk(namespace: string, path: string, nodes: Record<string, Dictionary>) {
    const keys = new Set(Object.values(nodes).flatMap(Object.keys));
    const families = new Set([...keys].filter(key => key.includes("_")).map(key => key.slice(0, key.indexOf("_"))));
    for (const family of families) {
      let reference: string | undefined;
      for (const language of languages) {
        const node = nodes[language] ?? {};
        const required = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
        for (const suffix of required) if (!(family + "_" + suffix in node)) add(language, namespace, path + family + "_" + suffix, "plural");
        if (family in node) add(language, namespace, path + family, "shape");
        for (const key of [...keys].filter(k => k.startsWith(family + "_"))) {
          if (!(key in node)) continue;
          const suffix = key.slice(family.length + 1);
          if (![...required, "zero"].includes(suffix)) add(language, namespace, path + key, "plural");
          const value = node[key];
          if (typeof value !== "string") { add(language, namespace, path + key, "shape"); continue; }
          if (!value.trim()) add(language, namespace, path + key, "empty");
          if (unsupportedInterpolation(value)) add(language, namespace, path + key, "interpolation");
          const params = parameters(value);
          reference ??= params;
          if (params !== reference || !params.split(",").includes("count")) add(language, namespace, path + key, "interpolation");
        }
      }
    }
    for (const key of keys) {
      if (key.includes("_") || families.has(key)) continue;
      if (!/^[a-z][A-Za-z0-9]*$/.test(key)) { for (const language of languages) if (key in (nodes[language] ?? {})) add(language, namespace, path + key, "shape"); }
      const values = languages.map(language => nodes[language]?.[key]);
      for (const language of languages) if (!(key in (nodes[language] ?? {}))) add(language, namespace, path + key, "missing");
      const defined = values.filter(v => v !== undefined);
      if (defined.some(record)) {
        if (defined.some(v => !record(v))) {
          // A string leaf is the canonical shape when the other language replaces it with an object.
          for (const language of languages) if (nodes[language]?.[key] !== undefined && typeof nodes[language][key] !== "string") add(language, namespace, path + key, "shape");
        } else {
          walk(namespace, path + key + ".", Object.fromEntries(languages.map(language => [language, record(nodes[language]?.[key]) ? nodes[language][key] : {}])) as Record<string,Dictionary>);
        }
        continue;
      }
      let reference: string | undefined;
      for (const language of languages) {
        const value = nodes[language]?.[key];
        if (value === undefined) continue;
        if (typeof value !== "string") { add(language, namespace, path + key, "shape"); continue; }
        if (!value.trim()) add(language, namespace, path + key, "empty");
        if (unsupportedInterpolation(value)) add(language, namespace, path + key, "interpolation");
        const params = parameters(value); reference ??= params;
        if (params !== reference) add(language, namespace, path + key, "interpolation");
      }
    }
  }
  for (const namespace of namespaces) {
    walk(namespace, "", Object.fromEntries(languages.map(language => {
      const value = record(resources[language]) ? resources[language][namespace] : undefined;
      return [language, record(value) ? value : {}];
    })));
  }
  return diagnostics;
}
