import { PlaceholderTable } from "../components/PlaceholderTable";

export function InstrumentsPage() {
  return (
    <PlaceholderTable
      title="投资标的"
      description="用于展示股票、ETF、基金、现金等投资标的。"
      columns={["代码", "名称", "市场", "币种", "类型"]}
    />
  );
}
