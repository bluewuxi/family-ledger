const sections = ["用户权限", "数据源", "导出与备份"];

export function SettingsPage() {
  return (
    <section>
      <header className="page-header">
        <h1>设置</h1>
        <p>仅保留 Stage 0 占位内容，权限和数据源配置将在后续阶段补充。</p>
      </header>

      <div className="settings-list">
        {sections.map((section) => (
          <section className="settings-row" key={section}>
            <h2>{section}</h2>
            <p>待配置</p>
          </section>
        ))}
      </div>
    </section>
  );
}
