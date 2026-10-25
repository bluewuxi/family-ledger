import { sha256 } from "./deployment-policy";

export interface Release { commit: string; confirmedAt: string; runUrl: string; artifactDigest: string; }

/** The release pointer is the final write, after every remote publication check succeeds. */
export async function commitVerifiedRelease(input: {
  commit: string; runUrl: string; backendDigest: string;
  verify: () => Promise<string>;
  save: (name: "status" | "last-success", record: Release & { stage?: string }) => void;
}): Promise<Release> {
  const webDigest = await input.verify();
  const record = { commit: input.commit, runUrl: input.runUrl, confirmedAt: new Date().toISOString(), artifactDigest: sha256(`${input.backendDigest}:${webDigest}`) };
  input.save("status", { ...record, stage: "verified" });
  input.save("last-success", record);
  return record;
}
