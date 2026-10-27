import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BusinessCategoryCombobox,
  comboboxCopy,
  groupSuggestionsByFamily,
  nextComboboxIndex,
  selectionFromCustomText,
  selectionFromSuggestion,
} from "./business-category-combobox";
import { searchBusinessCategories } from "@platform/website-engine";

const staticMarkup = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe("BusinessCategoryCombobox markup (SSR)", () => {
  it("renders ARIA combobox semantics with canonical hidden inputs", () => {
    const html = staticMarkup(<BusinessCategoryCombobox locale="en" name="category" required />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls");
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('name="category"');
    expect(html).toContain('type="hidden" name="categoryKey"');
    expect(html).toContain('type="hidden" name="subcategoryKey"');
    expect(html).not.toContain("<select");
  });

  it("closes the listbox by default and never renders a 50-entry select", () => {
    const html = staticMarkup(<BusinessCategoryCombobox locale="sq" />);
    expect(html).not.toContain('role="option"');
    expect(html).toContain("Kërko kategorinë…");
  });

  it("prefills and marks an existing custom label", () => {
    const html = staticMarkup(<BusinessCategoryCombobox locale="en" defaultLabel="Specialist Workshop" />);
    expect(html).toContain('value="Specialist Workshop"');
    expect(html).toContain('name="categoryKey" value="other"');
  });

  it("localizes the always-present Other copy", () => {
    expect(comboboxCopy("de").other).toContain("Andere");
    expect(comboboxCopy("sq").other).toContain("Tjetër");
    expect(comboboxCopy("en").other).toContain("Other");
  });
});

describe("combobox keyboard model", () => {
  it("moves from no selection into the list and wraps at both ends", () => {
    expect(nextComboboxIndex(-1, 1, 4)).toBe(0);
    expect(nextComboboxIndex(0, 1, 4)).toBe(1);
    expect(nextComboboxIndex(3, 1, 4)).toBe(0);
    expect(nextComboboxIndex(-1, -1, 4)).toBe(3);
    expect(nextComboboxIndex(0, -1, 4)).toBe(3);
  });

  it("is inert for an empty listbox", () => {
    expect(nextComboboxIndex(2, 1, 0)).toBe(-1);
  });

  it("counts the Other option as part of navigation", () => {
    const suggestions = searchBusinessCategories("metal", "en");
    const total = suggestions.length + 1;
    expect(nextComboboxIndex(-1, 1, total)).toBe(0);
    expect(nextComboboxIndex(total - 2, 1, total)).toBe(total - 1);
  });
});

describe("combobox selection model", () => {
  it("maps a suggestion to canonical keys and a localized label", () => {
    const [suggestion] = searchBusinessCategories("autoservis", "sq");
    const selection = selectionFromSuggestion(suggestion);
    expect(selection).toEqual({ label: "Autoservis", categoryKey: "automotive", subcategoryKey: "auto-repair", custom: false });
  });

  it("maps Other/Custom to the other family with the typed label", () => {
    const selection = selectionFromCustomText("  Specialized Restoration Services  ");
    expect(selection).toEqual({ label: "Specialized Restoration Services", categoryKey: "other", subcategoryKey: "", custom: true });
  });

  it("groups consecutive suggestions by family without reordering", () => {
    const groups = groupSuggestionsByFamily(searchBusinessCategories("metal", "en"));
    expect(groups[0]?.familyKey).toBe("construction-trades");
    expect(groups.flatMap((group) => group.items.map((item) => item.subcategoryKey)))
      .toEqual(searchBusinessCategories("metal", "en").map((item) => item.subcategoryKey));
  });
});
