import type { WebsiteChange } from "@platform/business-finder";
import {
  selectBusinessTemplate,
  templateCategories,
  type SupportedLocale,
} from "@platform/website-engine";

export type WorkspaceCategoryKey = (typeof templateCategories)[number]["key"];

export function workspaceCategoryFor(...values: Array<string | undefined>): WorkspaceCategoryKey {
  const template = selectBusinessTemplate(...values);
  return templateCategories.find((category) =>
    category.templates.includes(template.key as never),
  )?.key ?? "professional";
}

type WorkspaceUiCopy = {
  allCategories: string;
  categoryNavigation: string;
  businesses: (count: number) => string;
  lastChecked: string;
  websiteChange: Record<WebsiteChange["type"], string>;
  categories: Record<WorkspaceCategoryKey, string>;
};

const en: WorkspaceUiCopy = {
  allCategories: "All",
  categoryNavigation: "Business categories",
  businesses: (count) => `${count} business${count === 1 ? "" : "es"}`,
  lastChecked: "Last checked",
  websiteChange: { website_added: "Website added", website_removed: "Website removed", website_changed: "Website changed" },
  categories: { vehicle: "Vehicles", food: "Food & restaurants", beauty: "Beauty & hair", "health-care": "Health & care", wellness: "Wellness & therapy", professional: "Professional", pet: "Pet services", cleaning: "Cleaning", trade: "Trades", delivery: "Delivery & transport", garden: "Garden & outdoor", construction: "Construction" },
};

export const businessWorkspaceUiCopy: Record<SupportedLocale, WorkspaceUiCopy> = {
  en,
  de: { ...en, allCategories: "Alle", categoryNavigation: "Unternehmenskategorien", businesses: (n) => `${n} Unternehmen`, lastChecked: "Zuletzt geprüft", websiteChange: { website_added: "Website hinzugefügt", website_removed: "Website entfernt", website_changed: "Website geändert" }, categories: { vehicle: "Fahrzeuge", food: "Gastronomie", beauty: "Beauty & Haare", "health-care": "Gesundheit & Pflege", wellness: "Wellness & Therapie", professional: "Beratung & Büros", pet: "Tierdienste", cleaning: "Reinigung", trade: "Handwerk", delivery: "Transport & Lieferung", garden: "Garten & Außenbereich", construction: "Bau" } },
  fr: { ...en, allCategories: "Toutes", categoryNavigation: "Catégories d’entreprises", businesses: (n) => `${n} entreprise${n === 1 ? "" : "s"}`, lastChecked: "Dernière vérification", websiteChange: { website_added: "Site ajouté", website_removed: "Site supprimé", website_changed: "Site modifié" }, categories: { vehicle: "Automobile", food: "Restaurants", beauty: "Beauté & coiffure", "health-care": "Santé & soins", wellness: "Bien-être & thérapie", professional: "Services professionnels", pet: "Services animaliers", cleaning: "Nettoyage", trade: "Artisans", delivery: "Livraison & transport", garden: "Jardin & extérieur", construction: "Construction" } },
  es: { ...en, allCategories: "Todas", categoryNavigation: "Categorías de negocios", businesses: (n) => `${n} negocio${n === 1 ? "" : "s"}`, lastChecked: "Última comprobación", websiteChange: { website_added: "Sitio añadido", website_removed: "Sitio eliminado", website_changed: "Sitio modificado" }, categories: { vehicle: "Vehículos", food: "Restauración", beauty: "Belleza y cabello", "health-care": "Salud y cuidados", wellness: "Bienestar y terapia", professional: "Servicios profesionales", pet: "Servicios para mascotas", cleaning: "Limpieza", trade: "Oficios", delivery: "Entrega y transporte", garden: "Jardín y exterior", construction: "Construcción" } },
  it: { ...en, allCategories: "Tutte", categoryNavigation: "Categorie attività", businesses: (n) => `${n} attivit${n === 1 ? "à" : "à"}`, lastChecked: "Ultimo controllo", websiteChange: { website_added: "Sito aggiunto", website_removed: "Sito rimosso", website_changed: "Sito modificato" }, categories: { vehicle: "Veicoli", food: "Ristorazione", beauty: "Bellezza e capelli", "health-care": "Salute e assistenza", wellness: "Benessere e terapia", professional: "Servizi professionali", pet: "Servizi per animali", cleaning: "Pulizie", trade: "Artigiani", delivery: "Consegna e trasporto", garden: "Giardino ed esterni", construction: "Edilizia" } },
  sq: { ...en, allCategories: "Të gjitha", categoryNavigation: "Kategoritë e bizneseve", businesses: (n) => `${n} biznes${n === 1 ? "" : "e"}`, lastChecked: "Kontrolli i fundit", websiteChange: { website_added: "U shtua website", website_removed: "Website-i u hoq", website_changed: "Website-i ndryshoi" }, categories: { vehicle: "Automjete", food: "Restorante & ushqim", beauty: "Bukuri & flokë", "health-care": "Shëndet & kujdes", wellness: "Wellness & terapi", professional: "Shërbime profesionale", pet: "Shërbime për kafshë", cleaning: "Pastrim", trade: "Zanate & riparime", delivery: "Transport & dërgesa", garden: "Kopsht & ambiente të jashtme", construction: "Ndërtim" } },
};

export const workspaceCategoryKeys = templateCategories.map((category) => category.key);
