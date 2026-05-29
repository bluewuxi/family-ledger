import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { LedgerBackupManifest } from "../services/ledgerBackupBundle";

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  s3Client = new S3Client({});
  return s3Client;
}

export async function putLedgerBackupObject(input: {
  bucketName: string;
  key: string;
  body: Buffer;
  contentSha256: string;
  manifest: LedgerBackupManifest;
}): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: input.bucketName,
      Key: input.key,
      Body: input.body,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      ServerSideEncryption: "AES256",
      Metadata: {
        "backup-version": String(input.manifest.version),
        "backup-kind": input.manifest.backupKind,
        environment: input.manifest.environment,
        "generated-at": input.manifest.generatedAt,
        "content-sha256": input.contentSha256,
        "secrets-excluded": String(input.manifest.secretsExcluded)
      }
    })
  );
}
