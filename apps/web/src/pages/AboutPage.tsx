import { useTranslation } from "react-i18next";
import { BrandName } from "../components/BrandName";
import { useUiLanguage } from "../i18n/LanguageProvider";

const milestones = ["start", "present", "next"] as const;
const designIdeas = [
  { title: "logo", body: "logoBody" },
  { title: "colours", body: "coloursBody" },
  { title: "wordmark", body: "wordmarkBody" }
] as const;

export function AboutPage() {
  const { t } = useTranslation("about");
  const { language } = useUiLanguage();
  return (
    <section className="about-page">
      <div className="about-hero">
        <div className="about-hero-lockup">
          <div className="about-logo-stack">
            <img className="about-hero-logo" src="/icon-128x128.png" alt="" aria-hidden="true" />
            {language === "zh-CN" ? <span className="brand-subtitle about-logo-subtitle" aria-hidden="true">
              <span>Family</span>
              <span>Ledger</span>
            </span> : null}
          </div>
          <div className="about-hero-copy">
            <h1 className="about-brand-name"><BrandName /></h1>
            <p>
              {t("hero")}
            </p>
          </div>
        </div>
      </div>

      <section className="about-intro" aria-label={t("introLabel")}>
        <p>
          {t("intro")}
        </p>
        <p>
          {t("nameOrigin")}
        </p>
      </section>

      <section className="about-design" aria-labelledby="about-design-title">
        <div className="about-section-heading">
          <p className="eyebrow">{t("designEyebrow")}</p>
          <h2 id="about-design-title">{t("inspiration")}</h2>
        </div>
        <div className="about-design-list">
          {designIdeas.map((idea) => (
            <article key={idea.title}>
              <h3>{t(idea.title)}</h3>
              <p>{t(idea.body)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-principles" aria-label={t("principlesLabel")}>
        <article>
          <span>{t("dataEyebrow")}</span>
          <h2>{t("transparency")}</h2>
          <p>{t("transparencyBody")}</p>
        </article>
        <article>
          <span>{t("decisionsEyebrow")}</span>
          <h2>{t("sharedValue")}</h2>
          <p>{t("sharedValueBody")}</p>
        </article>
        <article>
          <span>{t("familyEyebrow")}</span>
          <h2>{t("cohesion")}</h2>
          <p>{t("cohesionBody")}</p>
        </article>
      </section>

      <section className="about-timeline" aria-labelledby="about-history">
        <div className="about-section-heading">
          <p className="eyebrow">{t("historyEyebrow")}</p>
          <h2 id="about-history">{t("history")}</h2>
        </div>
        <div className="timeline-list">
          {milestones.map((milestone) => (
            <article key={milestone}>
              <span>{t(milestone)}</span>
              <div>
                <h3>{t(`${milestone}Title`)}</h3>
                <p>{t(`${milestone}Body`)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="about-closing" aria-label={t("vision")}>
        <p className="eyebrow">{t("mission")}</p>
        <blockquote>{t("motto")}</blockquote>
        <p>
          {t("closing")}
        </p>
      </section>
    </section>
  );
}
