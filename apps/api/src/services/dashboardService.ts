export interface DashboardSummary {
  totalAssets: string;
  todayChange: string;
  unrealizedGain: string;
  accountCount: number;
}

export async function getDashboard(): Promise<DashboardSummary> {
  // TODO: Stage 3 will calculate dashboard values in services, not frontend components.
  return {
    totalAssets: "0.00",
    todayChange: "0.00",
    unrealizedGain: "0.00",
    accountCount: 0
  };
}
