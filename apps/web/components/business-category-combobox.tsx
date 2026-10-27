"use client";

import { useId, useMemo, useState } from "react";
import {
  searchBusinessCategories,
  type BusinessCategorySuggestion,
  type CategoryRegistryLocale,
} from "@platform/website-engine";

/**
 * Shared searchable business-category combobox (BSRC-DESIGN-P4-001).
 * One component for the owner complimentary form and the homepage wizard:
 * search-as-you-type over the canonical registry (labels, localized labels,
 * aliases; diacritics-insensitive), keyboard navigation, ARIA combobox/
 * listbox semantics, family grouping and an Other/Custom entry.
 *
 * The visible text input carries the chosen display label (or the custom
 * text when Other is chosen) under `name`; two hidden inputs carry the
 * canonical `categoryKey`/`subcategoryKey` so the server can store the
 * structured category without depending on the label string.
 */

export type ComboboxSelection = {
  label: string;
  categoryKey: string;
  subcategoryKey: string;
  custom: boolean;
};

export type BusinessCategoryComboboxProps = {
  locale?: CategoryRegistryLocale;
  name?: string;
  required?: boolean;
  defaultLabel?: string;
  placeholder?: string;
  /** Fires with the canonical selection whenever an entry is chosen. */
  onSelect?: (selection: ComboboxSelection) => void;
};

const copyByLocale: Record<CategoryRegistryLocale, { placeholder: string; other: string; listbox: string; customNote: string }> = {
  en: { placeholder: "Search business category…", other: "Other / Custom", listbox: "Business category suggestions", customNote: "Typed text is kept as a custom category." },
  de: { placeholder: "Geschäftskategorie suchen…", other: "Andere / Benutzerdefiniert", listbox: "Vorschläge für die Geschäftskategorie", customNote: "Eingegebener Text wird als eigene Kategorie übernommen." },
  fr: { placeholder: "Rechercher une catégorie…", other: "Autre / Personnalisé", listbox: "Suggestions de catégorie", customNote: "Le texte saisi est conservé comme catégorie personnalisée." },
  es: { placeholder: "Buscar categoría…", other: "Otro / Personalizado", listbox: "Sugerencias de categoría", customNote: "El texto escrito se conserva como categoría personalizada." },
  it: { placeholder: "Cerca categoria…", other: "Altro / Personalizzato", listbox: "Suggerimenti di categoria", customNote: "Il testo digitato viene mantenuto come categoria personalizzata." },
  sq: { placeholder: "Kërko kategorinë…", other: "Tjetër / Vetë", listbox: "Sugjerime kategorie", customNote: "Teksti i shkruar ruhet si kategori e veçantë." },
};

export const comboboxCopy = (locale: CategoryRegistryLocale) => copyByLocale[locale] ?? copyByLocale.en;

/** Pure keyboard model: next active option index with wrap-around and clamping. */
export function nextComboboxIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return (current + delta + total) % total;
}

export const selectionFromSuggestion = (suggestion: BusinessCategorySuggestion): ComboboxSelection => ({
  label: suggestion.label,
  categoryKey: suggestion.categoryKey,
  subcategoryKey: suggestion.subcategoryKey,
  custom: false,
});

export const selectionFromCustomText = (text: string): ComboboxSelection => ({
  label: text.trim(),
  categoryKey: "other",
  subcategoryKey: "",
  custom: true,
});

/** Groups consecutive suggestions by family while preserving ranking order. */
export function groupSuggestionsByFamily(suggestions: BusinessCategorySuggestion[]): Array<{ familyKey: string; familyLabel: string; items: BusinessCategorySuggestion[] }> {
  const groups: Array<{ familyKey: string; familyLabel: string; items: BusinessCategorySuggestion[] }> = [];
  for (const suggestion of suggestions) {
    const last = groups.at(-1);
    if (last && last.familyKey === suggestion.categoryKey) last.items.push(suggestion);
    else groups.push({ familyKey: suggestion.categoryKey, familyLabel: suggestion.familyLabel, items: [suggestion] });
  }
  return groups;
}

export function BusinessCategoryCombobox({
  locale = "en",
  name = "category",
  required = false,
  defaultLabel = "",
  placeholder,
  onSelect,
}: BusinessCategoryComboboxProps) {
  const copy = comboboxCopy(locale);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const inputId = `${reactId}-input`;
  const [query, setQuery] = useState(defaultLabel);
  const [selection, setSelection] = useState<ComboboxSelection | null>(defaultLabel ? selectionFromCustomText(defaultLabel) : null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const suggestions = useMemo(() => searchBusinessCategories(query, locale, 8), [query, locale]);
  // One virtual "Other / Custom" entry is always the last option.
  const optionCount = suggestions.length + 1;

  const choose = (next: ComboboxSelection) => {
    setSelection(next);
    setQuery(next.label);
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => nextComboboxIndex(current, 1, optionCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => nextComboboxIndex(current, -1, optionCount));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) choose(selectionFromSuggestion(suggestions[activeIndex]));
      else if (activeIndex === suggestions.length) choose(selectionFromCustomText(query));
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        setQuery(selection?.label ?? "");
      }
    }
  };

  const activeId = open && activeIndex >= 0
    ? (activeIndex < suggestions.length ? `${reactId}-opt-${activeIndex}` : `${reactId}-opt-other`)
    : undefined;
  const groups = groupSuggestionsByFamily(suggestions);

  return (
    <span className="category-combobox">
      <input
        id={inputId}
        name={name}
        type="text"
        required={required}
        maxLength={120}
        autoComplete="off"
        value={query}
        placeholder={placeholder ?? copy.placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelection(null);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {/* Canonical keys travel with the form; empty when custom/Other or unselected. */}
      <input type="hidden" name="categoryKey" value={selection?.categoryKey ?? ""} />
      <input type="hidden" name="subcategoryKey" value={selection?.subcategoryKey ?? ""} />
      {open ? (
        <ul className="category-combobox-list" role="listbox" id={listboxId} aria-label={copy.listbox}>
          {groups.map((group) => (
            <li key={group.familyKey} role="group" aria-label={group.familyLabel}>
              <span className="category-combobox-group" role="presentation">{group.familyLabel}</span>
              <ul className="category-combobox-group-items" role="presentation">
                {group.items.map((suggestion) => {
                  const index = suggestions.indexOf(suggestion);
                  return (
                    <li
                      key={suggestion.subcategoryKey}
                      role="option"
                      id={`${reactId}-opt-${index}`}
                      aria-selected={selection?.subcategoryKey === suggestion.subcategoryKey}
                      className={index === activeIndex ? "active" : ""}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(selectionFromSuggestion(suggestion))}
                    >
                      <strong>{suggestion.label}</strong>
                      <small>{suggestion.familyLabel}</small>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          <li
            role="option"
            id={`${reactId}-opt-other`}
            aria-selected={selection?.custom === true}
            className={suggestions.length === activeIndex ? "active" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(selectionFromCustomText(query))}
          >
            <strong>{copy.other}</strong>
            <small>{query.trim() ? query.trim() : copy.customNote}</small>
          </li>
        </ul>
      ) : null}
    </span>
  );
}
