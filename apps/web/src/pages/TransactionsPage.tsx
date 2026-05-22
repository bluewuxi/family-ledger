import { PlaceholderTable } from "../components/PlaceholderTable";

export function TransactionsPage() {
  return (
    <PlaceholderTable
      title="交易记录"
      description="交易写入和校验将在 Lambda API 服务层实现。"
      columns={["日期", "账户", "标的", "类型", "数量", "金额", "币种"]}
    />
  );
}
