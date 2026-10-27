"use client";

import { useState } from "react";
import type { BillingCurrency } from "../lib/platform-config";

const labels: Record<BillingCurrency, string> = {
  EUR: "EUR",
  USD: "USD",
  ALL: "ALL",
};

export function CurrencySelector({ current, label = "Currency", currencies }: { current: BillingCurrency; label?: string; currencies?: readonly BillingCurrency[] }) {
  const [value, setValue] = useState(current);
  const availableCurrencies = currencies?.length ? currencies : Object.keys(labels) as BillingCurrency[];

  function change(currency: BillingCurrency) {
    document.cookie = `platform_currency=${currency}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setValue(currency);
    window.location.reload();
  }

  return (
    <label className="language-selector currency-selector" aria-label={label}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => change(event.target.value as BillingCurrency)}>
        {availableCurrencies.map((currency) => <option key={currency} value={currency}>{labels[currency]}</option>)}
      </select>
    </label>
  );
}
