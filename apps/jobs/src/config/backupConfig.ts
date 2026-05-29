export interface LedgerBackupConfig {
  environmentName: string;
  bucketName: string;
}

export function getLedgerBackupConfig(): LedgerBackupConfig {
  const environmentName = process.env.ENVIRONMENT_NAME;
  const bucketName = process.env.BACKUP_BUCKET_NAME;

  if (!environmentName) {
    throw new Error("ENVIRONMENT_NAME is required for ledger backups.");
  }

  if (!bucketName) {
    throw new Error("BACKUP_BUCKET_NAME is required for ledger backups.");
  }

  return {
    environmentName,
    bucketName
  };
}
