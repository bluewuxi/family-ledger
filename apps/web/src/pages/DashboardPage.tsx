const metrics = [
  { label: "总资产", value: "NZD 0.00" },
  { label: "今日变动", value: "0.00%" },
  { label: "未实现收益", value: "NZD 0.00" },
  { label: "账户数量", value: "0" }
];

export function DashboardPage() {
  return (
    <section>
      <header className="page-header">
        <h1>仪表盘</h1>
        <p>投资总览将在后续阶段由 Lambda API 计算并返回。</p>
      </header>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
