import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { configuredPlatformLocale } from "../../../lib/platform-config";
import { accountCopy } from "../../../lib/account-copy";
import { customerLifecycleCopy } from "../../../lib/customer-lifecycle-copy";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  const locale = configuredPlatformLocale((await cookies()).get("platform_locale")?.value);
  const copy = accountCopy[locale];
  if (!params.token) redirect("/site-admin/forgot-password");
  return (
    <main className="shell">
      <p className="eyebrow">{copy.reset.eyebrow}</p>
      <h1>{copy.reset.title}</h1>
      <form action="/api/site-admin/reset-password" method="post" className="admin-login">
        <input type="hidden" name="token" value={params.token} />
        <input required name="password" type="password" minLength={12} placeholder={copy.reset.passwordPlaceholder} />
        <p>{customerLifecycleCopy[locale].security.resetPrivacy} <Link href={`/legal/privacy?lang=${locale}`}>{customerLifecycleCopy[locale].common.privacy}</Link></p>
        <button className="button">{copy.reset.save}</button>
      </form>
      {params.error ? <p className="error">{copy.reset.invalid}</p> : null}
      <p><Link href="/site-admin/login">{copy.reset.back}</Link></p>
    </main>
  );
}
