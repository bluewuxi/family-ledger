import { canonical, type JsonObject } from "./deployment-policy";

/** Resolve only the intrinsics used by the existing schedules; unknown forms fail closed. */
export function resolveSchedule(value: unknown, parameters: Record<string, string>, arns: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map(v => resolveSchedule(v, parameters, arns));
  if (!value || typeof value !== "object") return value;
  const object = value as JsonObject;
  if ("Ref" in object) {
    if (typeof object.Ref !== "string" || !(object.Ref in parameters)) throw new Error("Unknown schedule parameter reference.");
    return parameters[object.Ref];
  }
  if ("Fn::GetAtt" in object) {
    const pair = object["Fn::GetAtt"];
    if (!Array.isArray(pair) || pair[1] !== "Arn" || !arns[String(pair[0])]) throw new Error("Unknown schedule resource reference.");
    return arns[String(pair[0])];
  }
  if ("Fn::Sub" in object) {
    if (typeof object["Fn::Sub"] !== "string") throw new Error("Unsupported schedule substitution.");
    return object["Fn::Sub"].replace(/\$\{([^}]+)\}/g, (_, key: string) => {
      if (!(key in parameters)) throw new Error("Unknown schedule substitution parameter.");
      return parameters[key];
    });
  }
  if ("Fn::If" in object) {
    const condition = object["Fn::If"];
    if (!Array.isArray(condition) || condition[0] !== "ScheduledJobsEnabled") throw new Error("Unknown schedule condition.");
    return resolveSchedule(condition[parameters.EnableScheduledJobs === "true" ? 1 : 2], parameters, arns);
  }
  if (Object.keys(object).some(k => k.startsWith("Fn::"))) throw new Error("Unsupported schedule intrinsic.");
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, resolveSchedule(v, parameters, arns)]));
}
export function assertLiveSchedule(expected: JsonObject, live: JsonObject): void {
  for (const key of Object.keys(expected)) if (canonical(expected[key]) !== canonical(live[key])) throw new Error(`Live schedule drift at ${key}; independent reconciliation required.`);
  for (const key of ["StartDate", "EndDate", "KmsKeyArn"]) if (live[key] !== undefined && expected[key] === undefined) throw new Error(`Unexpected live schedule ${key}.`);
  if (live.GroupName !== undefined && live.GroupName !== "default") throw new Error("Unexpected live schedule group.");
  if (live.ActionAfterCompletion !== undefined && live.ActionAfterCompletion !== "NONE") throw new Error("Unexpected live schedule completion action.");
}
