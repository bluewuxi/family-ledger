import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "./LanguageSwitch";
export function ConfirmationDialog({open,title,message,confirmLabel,onConfirm,onCancel,busy=false}: {open:boolean;title:string;message:string;confirmLabel:string;onConfirm:()=>void;onCancel:()=>void;busy?:boolean}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({onCancel,busy}); callbacks.current={onCancel,busy};
  const dispatched = useRef(false);
  const id = useId(); const {t} = useTranslation("common");
  useEffect(() => {
    if (!open) return;
    const element=dialog.current; if (!element) return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    dispatched.current=false; element.showModal(); cancel.current?.focus();
    const escape=(event:Event)=>{event.preventDefault();if(!callbacks.current.busy)callbacks.current.onCancel();};
    element.addEventListener("cancel",escape);
    return ()=>{element.removeEventListener("cancel",escape);element.close();if(previous?.isConnected)previous.focus();};
  },[open]);
  if (!open) return null;
  return createPortal(<dialog ref={dialog} className="confirmation-dialog" data-confirmation-dialog aria-labelledby={id} aria-describedby={`${id}-message`}><h2 id={id}>{title}</h2><p id={`${id}-message`}>{message}</p><LanguageSwitch /><div className="confirmation-actions"><button ref={cancel} type="button" className="secondary-button" disabled={busy} onClick={onCancel}>{t("cancel")}</button><button type="button" className="primary-button" disabled={busy} onClick={()=>{if(dispatched.current||busy)return;dispatched.current=true;onConfirm();}}>{confirmLabel}</button></div></dialog>,document.body);
}
