const milestones = [
  {
    year: "起点",
    title: "从分散记录到一份共同账本",
    body: "最初的问题很朴素：美股、港股、A 股基金、新西兰 PIE 基金和现金账户散落在不同平台，家庭成员很难用同一种口径理解资产现状。小家大财从这个痛点开始，把账户、标的、交易和持仓先放到同一个清晰结构里。"
  },
  {
    year: "现在",
    title: "让数据缺口也被看见",
    body: "项目没有假装所有价格、汇率和成本都永远完整。缺少行情、汇率或成本依据时，页面会直接提示，而不是给出看似精确的合计。这种透明，比漂亮但无法核对的数字更重要。"
  },
  {
    year: "下一步",
    title: "从记录走向复盘",
    body: "在稳定记录和估值之后，系统会逐步补充报表、税务辅助和导出能力。方向不是做一个复杂的金融终端，而是帮助家人定期复盘：钱在哪里，为什么变化，哪些选择值得继续。"
  }
];

const designIdeas = [
  {
    title: "标志",
    body: "树形图案来自家庭资产的生长感：根部代表账本和记录，枝叶代表账户、标的和长期积累。它不是装饰图案，而是提醒每一笔变化都应该能回到同一个清晰来源。"
  },
  {
    title: "色彩",
    body: "深蓝负责稳定和秩序，金色负责价值、收获和提醒，绿色保留家庭项目的生活感。界面尽量克制，让数字、时间和数据缺口成为真正的焦点。"
  },
  {
    title: "字标",
    body: "“小家”保持亲近，“大”字更高更醒目，表达长期积累带来的分量；“财”用金色收尾，强调财富记录要服务于家庭共识，而不是复杂炫技。"
  }
];

export function AboutPage() {
  return (
    <section className="about-page">
      <div className="about-hero">
        <div className="about-hero-lockup" aria-label="小家大财 Family Ledger">
          <div className="about-logo-stack">
            <img className="about-hero-logo" src="/icon-128x128.png" alt="" aria-hidden="true" />
            <span className="brand-subtitle about-logo-subtitle" aria-label="Family Ledger">
              <span>Family</span>
              <span>Ledger</span>
            </span>
          </div>
          <div className="about-hero-copy">
            <h1 className="about-brand-name" aria-label="小家大财">
              <span>小</span>
              <span>家</span>
              <span className="about-brand-emphasis">大</span>
              <span className="about-brand-gold">财</span>
            </h1>
            <p>
              为一个小家庭打造的投资账本。它记录资产，也记录共识：让每一笔变化都能解释，让每一次讨论都基于同一份事实。
            </p>
          </div>
        </div>
      </div>

      <section className="about-intro" aria-label="项目介绍">
        <p>
          小家大财不是面向机构的复杂系统，也不是临时拼出来的电子表格。它是一个长期维护的家庭项目：用简洁的权限、稳定的接口和可核对的数据，
          把日常投资记录变成一家人都能看懂、能信任、能持续使用的资产档案。
        </p>
        <p>
          这个项目的英文名保留为 Family Ledger，因为它的核心始终是 ledger：清楚、克制、可追溯。中文名“小家大财”强调另一层含义：
          家不必大，资产也未必复杂，但共同理解和长期积累值得被认真对待。
        </p>
      </section>

      <section className="about-design" aria-labelledby="about-design-title">
        <div className="about-section-heading">
          <p className="eyebrow">Design Language</p>
          <h2 id="about-design-title">灵感 & 创意</h2>
        </div>
        <div className="about-design-list">
          {designIdeas.map((idea) => (
            <article key={idea.title}>
              <h3>{idea.title}</h3>
              <p>{idea.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-principles" aria-label="项目原则">
        <article>
          <span>Transparency</span>
          <h2>透明</h2>
          <p>数据从哪里来、什么时候更新、哪里不完整，都应该直接呈现。看清限制，才有可靠判断。</p>
        </article>
        <article>
          <span>Common Value</span>
          <h2>共同价值</h2>
          <p>家庭账本不是一个人的控制台，而是一套共同语言。它帮助家人围绕事实沟通风险、目标和选择。</p>
        </article>
        <article>
          <span>Cohesion</span>
          <h2>凝聚</h2>
          <p>资产管理最终服务于生活。系统要减少误解和重复劳动，把注意力还给长期计划和家庭协作。</p>
        </article>
      </section>

      <section className="about-timeline" aria-labelledby="about-history">
        <div className="about-section-heading">
          <p className="eyebrow">Project History</p>
          <h2 id="about-history">心路历程</h2>
        </div>
        <div className="timeline-list">
          {milestones.map((milestone) => (
            <article key={milestone.title}>
              <span>{milestone.year}</span>
              <div>
                <h3>{milestone.title}</h3>
                <p>{milestone.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-closing" aria-label="愿景">
        <p className="eyebrow">Mission</p>
        <blockquote>把复杂留在系统里，把判断还给家人。</blockquote>
        <p>
          小家大财会继续保持克制：不堆叠复杂角色，不承诺不该承诺的税务结论，不让前端成为业务规则的唯一来源。
          它要成为一个安静、可靠、长期可维护的家庭财富记录工具。
        </p>
      </section>
    </section>
  );
}
