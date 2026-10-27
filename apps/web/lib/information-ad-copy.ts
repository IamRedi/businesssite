import type { InformationAdFormat, InformationAdSlotKey, SupportedLocale } from "@platform/website-engine";

export type InformationAdCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  enabled: string;
  format: string;
  save: string;
  advertisement: string;
  slots: Record<InformationAdSlotKey, string>;
  formats: Record<InformationAdFormat, string>;
  sponsor: { title: string; intro: string; add: string; save: string; name: string; headline: string; description: string; action: string; url: string; image: string; position: string; order: string; active: string; empty: string; error: string; saved: string };
};

const en: InformationAdCopy = {
  eyebrow: "Advertising",
  title: "Ad placements",
  intro: "Choose where first-party sponsor banners may appear. Empty positions stay hidden.",
  enabled: "Enabled",
  format: "Format",
  save: "Save ad placements",
  advertisement: "Advertisement",
  slots: {
    home_after_featured: "Home · after featured story",
    category_before_feed: "Category · before article feed",
    article_after_media: "Article · after featured media",
    article_sidebar: "Article · sidebar",
  },
  formats: { auto: "Automatic", leaderboard: "Leaderboard", rectangle: "Rectangle", in_feed: "In-feed" },
  sponsor: { title: "Sponsor banners", intro: "Add a business and direct HTTPS link. An image is required before activation. Active banners appear in the selected position without third-party scripts or tracking.", add: "Add banner", save: "Save banner", name: "Business name", headline: "Banner headline", description: "Short description", action: "Button text", url: "Destination link (HTTPS)", image: "Banner image", position: "Position", order: "Display order", active: "Active", empty: "No sponsor banners yet. Add one when the business details are ready.", error: "The banner could not be saved. Check the link and image.", saved: "Banner saved." },
};

export const informationAdCopy: Record<SupportedLocale, InformationAdCopy> = {
  en,
  de: { ...en, eyebrow: "Werbung", title: "Werbeplätze", intro: "Wählen Sie Positionen für direkte Sponsorenbanner. Leere Plätze bleiben unsichtbar.", enabled: "Aktiv", format: "Format", save: "Werbeplätze speichern", advertisement: "Anzeige", slots: { home_after_featured: "Startseite · nach dem Hauptartikel", category_before_feed: "Kategorie · vor dem Artikelfeed", article_after_media: "Artikel · nach den Medien", article_sidebar: "Artikel · Seitenleiste" }, formats: { auto: "Automatisch", leaderboard: "Leaderboard", rectangle: "Rechteck", in_feed: "Im Feed" } },
  fr: { ...en, eyebrow: "Publicité", title: "Emplacements publicitaires", intro: "Choisissez les emplacements des bannières de sponsors directs. Les emplacements vides restent masqués.", enabled: "Activé", format: "Format", save: "Enregistrer les emplacements", advertisement: "Publicité", slots: { home_after_featured: "Accueil · après l’article principal", category_before_feed: "Catégorie · avant le fil d’articles", article_after_media: "Article · après les médias", article_sidebar: "Article · barre latérale" }, formats: { auto: "Automatique", leaderboard: "Bannière", rectangle: "Rectangle", in_feed: "Dans le fil" } },
  es: { ...en, eyebrow: "Publicidad", title: "Espacios publicitarios", intro: "Elija espacios para banners de patrocinadores directos. Los espacios vacíos permanecen ocultos.", enabled: "Activo", format: "Formato", save: "Guardar espacios", advertisement: "Publicidad", slots: { home_after_featured: "Inicio · después del artículo destacado", category_before_feed: "Categoría · antes de la lista", article_after_media: "Artículo · después de los medios", article_sidebar: "Artículo · barra lateral" }, formats: { auto: "Automático", leaderboard: "Banner", rectangle: "Rectángulo", in_feed: "En la lista" } },
  it: { ...en, eyebrow: "Pubblicità", title: "Spazi pubblicitari", intro: "Scegli le posizioni per i banner degli sponsor diretti. Gli spazi vuoti restano nascosti.", enabled: "Attivo", format: "Formato", save: "Salva spazi", advertisement: "Pubblicità", slots: { home_after_featured: "Home · dopo l’articolo principale", category_before_feed: "Categoria · prima del feed", article_after_media: "Articolo · dopo i media", article_sidebar: "Articolo · barra laterale" }, formats: { auto: "Automatico", leaderboard: "Banner", rectangle: "Rettangolo", in_feed: "Nel feed" } },
  sq: { ...en, eyebrow: "Reklamat", title: "Pozicionet e reklamave", intro: "Zgjidh ku mund të shfaqen bannerët e sponsorëve. Pozicionet bosh nuk shfaqen në faqe.", enabled: "Aktive", format: "Formati", save: "Ruaj pozicionet", advertisement: "Reklamë", slots: { home_after_featured: "Ballina · pas artikullit kryesor", category_before_feed: "Kategoria · para listës së artikujve", article_after_media: "Artikulli · pas fotove", article_sidebar: "Artikulli · paneli anësor" }, formats: { auto: "Automatik", leaderboard: "Banner", rectangle: "Drejtkëndësh", in_feed: "Në listë" }, sponsor: { title: "Bannerët e sponsorëve", intro: "Shto biznesin, linkun direkt HTTPS dhe foton. Bannerët aktivë shfaqen pa skripte ose gjurmim nga palë të treta.", add: "Shto banner", save: "Ruaj bannerin", name: "Emri i biznesit", headline: "Titulli i bannerit", description: "Përshkrimi i shkurtër", action: "Teksti i butonit", url: "Linku ku të çon (HTTPS)", image: "Fotoja e bannerit", position: "Pozicioni", order: "Renditja", active: "Aktiv", empty: "Nuk ka ende bannerë. Shtoji kur të jenë gati të dhënat e bizneseve.", error: "Banneri nuk u ruajt. Kontrollo linkun dhe foton.", saved: "Banneri u ruajt." } },
};
