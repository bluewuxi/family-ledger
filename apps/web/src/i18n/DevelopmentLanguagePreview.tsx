import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUiLanguage } from "./LanguageProvider";
import { isLocalLanguagePreview } from "./language";
import { formatDisplayAmount } from "../lib/numberFormat";
import { formatCalendarDate, formatLocalDateTime, formatAppBusinessDayCountdown } from "../lib/timeFormat";
import "./preview.css";

function LanguageButtons() {
  const {language, setLanguage} = useUiLanguage();
  return <div className="language-preview-actions">
    <button type="button" aria-pressed={language === "zh-CN"} onClick={() => { setLanguage("zh-CN").catch(() => { console.error("Language preview switch failed"); }); }}>中文</button>
    <button type="button" aria-pressed={language === "en"} onClick={() => { setLanguage("en").catch(() => { console.error("Language preview switch failed"); }); }}>English</button>
  </div>;
}

export function DevelopmentLanguagePreview() {
  if (!isLocalLanguagePreview(import.meta.env.DEV, window.location.hostname)) return null;
  return <PreviewSamples />;
}

function PreviewSamples() {
  const {t} = useTranslation("preview");
  const {language, displayLocale} = useUiLanguage();
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState("sample-1");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [error] = useState({key:"error" as const, params:{id:"sample-1"}});
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <details className="language-preview" data-preview-theme={theme}>
    <summary>{t("title")}</summary>
    <div className="language-preview-body">
      <p role="note"><strong>{t("notice")}</strong></p>
      <LanguageButtons />
      <label>{t("theme")}<select value={theme} onChange={event => setTheme(event.target.value)}><option value="light">{t("light")}</option><option value="dark">{t("dark")}</option></select></label>
      <label>{t("draft")}<input value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <label>{t("selected")}<select value={selected} onChange={event => setSelected(event.target.value)}><option value="sample-1">sample-1</option><option value="sample-2">sample-2</option></select></label>
      <label>{t("page")}<input type="number" min="1" value={page} onChange={event => setPage(Number(event.target.value))} /></label>
      <label>{t("filter")}<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t("all")}</option><option value="active">{t("active")}</option></select></label>
      <p role="status">{t(error.key, error.params)}</p>
      <dl>
        <dt>{t("amount")}</dt><dd>{formatDisplayAmount("12345.6789", displayLocale)}</dd>
        <dt>{t("date")}</dt><dd>{formatCalendarDate("2024-02-29", "-", language)}</dd>
        <dt>{t("time")}</dt><dd>{formatLocalDateTime("2026-05-28T00:30:00Z", "-", undefined, language)}</dd>
        <dt>{t("countdown")}</dt><dd>{formatAppBusinessDayCountdown(new Date("2026-05-27T21:59:59Z"), language)}</dd>
      </dl>
      <p>{t("sampleCount", {count:2})}</p>
      <button ref={opener} type="button" onClick={() => setOpen(true)}>{t("openDialog")}</button>
      <dialog ref={dialog} aria-labelledby={id} onCancel={() => setOpen(false)} onClose={() => { setOpen(false); opener.current?.focus(); }}>
        <h2 id={id}>{t("dialog")}</h2><p>{t("notice")}</p>
        <LanguageButtons /><p role="status">{t(error.key, error.params)}</p>
        <button type="button" onClick={() => setOpen(false)}>{t("close")}</button>
      </dialog>
    </div>
  </details>;
}
