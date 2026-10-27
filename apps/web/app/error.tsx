"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = typeof document !== "undefined" && document.documentElement.lang === "de" ? "de" : "en";
  const copy = locale === "de"
    ? { title: "Die Seite konnte nicht geladen werden.", body: "Bitte versuchen Sie es erneut. Es werden keine technischen Fehlerdetails angezeigt.", retry: "Erneut versuchen" }
    : { title: "The page could not be loaded.", body: "Please try again. Technical error details are not displayed.", retry: "Try again" };
  return <main className="shell" role="alert"><h1>{copy.title}</h1><p>{copy.body}</p><button className="button" type="button" onClick={reset}>{copy.retry}</button></main>;
}
