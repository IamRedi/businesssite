import { ownerPanelLocale } from "../../../lib/locale-model";
import { ownerLoginCopy } from "../../../lib/owner-login-copy";
import { authAbuseCopy } from "../../../lib/auth-abuse-copy";

export default async function OwnerLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const locale = ownerPanelLocale;
  const copy = ownerLoginCopy[locale];
  const error = (await searchParams).error;
  return (
    <main className="shell">
      <p className="eyebrow">{copy.eyebrow}</p>
      <h1>{copy.title}</h1>
      <form action="/api/owner/auth/login" method="post" className="admin-login">
        <input required name="email" type="email" autoComplete="username" placeholder={copy.email} />
        <input required name="password" type="password" autoComplete="current-password" placeholder={copy.password} />
        <button className="button">{copy.continue}</button>
      </form>
      {error === "invalid" ? <p className="error">{authAbuseCopy[locale].invalid}</p> : null}
      {error === "rate" ? <p className="error">{authAbuseCopy[locale].rateLimited}</p> : null}
      {error === "configuration" ? <p className="error">{authAbuseCopy[locale].ownerConfiguration}</p> : null}
    </main>
  );
}
