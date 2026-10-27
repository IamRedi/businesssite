import Link from "next/link";
import { cookies } from "next/headers";
import { configuredPlatformLocale } from "../lib/platform-config";

export default async function NotFound() {
  const locale = configuredPlatformLocale((await cookies()).get("platform_locale")?.value);
  const copy = locale === "de"
    ? { eyebrow: "404", title: "Diese Seite wurde nicht gefunden.", body: "Prüfen Sie die Adresse oder kehren Sie zur Startseite zurück.", action: "Zur Startseite" }
    : { eyebrow: "404", title: "This page could not be found.", body: "Check the address or return to the home page.", action: "Back to home" };
  return <main className="shell"><p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.body}</p><Link className="button" href="/">{copy.action}</Link></main>;
}
