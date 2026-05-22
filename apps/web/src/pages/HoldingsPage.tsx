import { PlaceholderTable } from "../components/PlaceholderTable";

export function HoldingsPage() {
  return (
    <PlaceholderTable
      title="持仓总览"
      description="持仓、成本和收益计算后续由 API 服务层提供。"
      columns={["标的", "账户", "数量", "成本", "市值", "未实现收益"]}
    />
  );
}
