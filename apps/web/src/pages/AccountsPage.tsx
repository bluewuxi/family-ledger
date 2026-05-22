import { PlaceholderTable } from "../components/PlaceholderTable";

export function AccountsPage() {
  return (
    <PlaceholderTable
      title="投资账户"
      description="账户数据后续通过 Lambda API 获取，写入操作仅允许 admin 在 API 层完成。"
      columns={["账户名称", "券商/平台", "账户类型", "基准货币", "主要市场"]}
    />
  );
}
