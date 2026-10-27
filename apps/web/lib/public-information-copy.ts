import type { SupportedLocale } from "@platform/website-engine";

export type PublicInformationCopy = {
  latest: string;
  featured: string;
  categories: string;
  allArticles: string;
  readArticle: string;
  published: string;
  by: string;
  summary: string;
  sources: string;
  related: string;
  share: string;
  next: string;
  noArticles: string;
  admin: string;
};

const en: PublicInformationCopy = {
  latest: "Latest articles", featured: "Featured", categories: "Categories", allArticles: "All articles",
  readArticle: "Read article", published: "Published", by: "By", summary: "In brief", sources: "Sources",
  related: "Related articles", share: "Share", next: "Next articles", noArticles: "No published articles yet.", admin: "Editorial login",
};

export const publicInformationCopy: Record<SupportedLocale, PublicInformationCopy> = {
  en,
  de: { latest: "Neueste Artikel", featured: "Im Fokus", categories: "Kategorien", allArticles: "Alle Artikel", readArticle: "Artikel lesen", published: "Veröffentlicht", by: "Von", summary: "Kurz zusammengefasst", sources: "Quellen", related: "Ähnliche Artikel", share: "Teilen", next: "Weitere Artikel", noArticles: "Noch keine veröffentlichten Artikel.", admin: "Redaktions-Login" },
  fr: { latest: "Derniers articles", featured: "À la une", categories: "Catégories", allArticles: "Tous les articles", readArticle: "Lire l’article", published: "Publié", by: "Par", summary: "En bref", sources: "Sources", related: "Articles liés", share: "Partager", next: "Articles suivants", noArticles: "Aucun article publié pour le moment.", admin: "Connexion rédaction" },
  es: { latest: "Últimos artículos", featured: "Destacado", categories: "Categorías", allArticles: "Todos los artículos", readArticle: "Leer artículo", published: "Publicado", by: "Por", summary: "En resumen", sources: "Fuentes", related: "Artículos relacionados", share: "Compartir", next: "Más artículos", noArticles: "Todavía no hay artículos publicados.", admin: "Acceso editorial" },
  it: { latest: "Ultimi articoli", featured: "In evidenza", categories: "Categorie", allArticles: "Tutti gli articoli", readArticle: "Leggi l’articolo", published: "Pubblicato", by: "Di", summary: "In breve", sources: "Fonti", related: "Articoli correlati", share: "Condividi", next: "Altri articoli", noArticles: "Non ci sono ancora articoli pubblicati.", admin: "Accesso redazione" },
  sq: { latest: "Artikujt e fundit", featured: "Kryesor", categories: "Kategoritë", allArticles: "Të gjithë artikujt", readArticle: "Lexo artikullin", published: "Publikuar", by: "Nga", summary: "Përmbledhja", sources: "Burimet", related: "Artikuj të ngjashëm", share: "Shpërndaje", next: "Artikujt e tjerë", noArticles: "Nuk ka ende artikuj të publikuar.", admin: "Hyrja editoriale" },
};
