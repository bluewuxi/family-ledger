import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import type { CurrencyCode, SnapshotDisplayCurrency } from "@family-ledger/shared";

type CurrencyValue = CurrencyCode | SnapshotDisplayCurrency;

interface CurrencySelectProps<T extends CurrencyValue> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

const currencyCountryLabels: Record<string, "countryNzd" | "countryUsd" | "countryHkd" | "countryCny" | "countryGbp" | "countryEur"> = {
  NZD: "countryNzd",
  USD: "countryUsd",
  HKD: "countryHkd",
  CNY: "countryCny",
  GBP: "countryGbp",
  EUR: "countryEur"
};

export function CurrencySelect<T extends CurrencyValue>({ label, options, value, onChange, disabled }: CurrencySelectProps<T>) {
  const {t} = useTranslation("common");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(".language-switch")) return;
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="currency-select" ref={rootRef}>
      <span className="currency-select-label">{label}</span>
      <button
        className="currency-select-button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <CurrencyFlagIcon currency={value} />
        <span>{value}</span>
      </button>
      {open ? (
        <div className="currency-select-menu" role="listbox" aria-label={label}>
          {options.map((currency) => (
            <button
              className={currency === value ? "active" : undefined}
              type="button"
              role="option"
              aria-selected={currency === value}
              key={currency}
              onClick={() => {
                onChange(currency);
                setOpen(false);
              }}
            >
              <CurrencyFlagIcon currency={currency} />
              <span>{currency}</span>
              <small>{t(currencyCountryLabels[currency])}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CurrencyFlagIcon({ currency }: { currency: CurrencyValue }) {
  return <img className="currency-flag" src={`/flags/${currency.toLowerCase()}.svg`} alt="" aria-hidden="true" />;
}
