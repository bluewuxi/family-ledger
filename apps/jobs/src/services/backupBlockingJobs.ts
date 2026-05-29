import { FRANKFURTER_FX_JOB_NAME } from "./fxRateIngestionService";
import { UPDATE_PRICES_JOB_NAME } from "./instrumentPriceIngestionService";
import { GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME } from "./portfolioSnapshotGenerationService";

export const BACKUP_BLOCKING_JOB_NAMES = [
  FRANKFURTER_FX_JOB_NAME,
  UPDATE_PRICES_JOB_NAME,
  GENERATE_PORTFOLIO_SNAPSHOTS_JOB_NAME
] as const;
