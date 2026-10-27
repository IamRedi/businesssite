import Link from "next/link";
import { cookies } from "next/headers";
import { configuredPlatformLocale } from "../../../lib/platform-config";
import { accountCopy } from "../../../lib/account-copy";
import { customerLifecycleCopy } from "../../../lib/customer-lifecycle-copy";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ sent?: string; delivery?: string }> }) {
  const locale = configuredPlatformLocale((await cookies()).get("platform_locale")?.value);
  const copy = accountCopy[locale];
  return (
    <main className="shell">
      <p className="eyebrow">{copy.forgot.eyebrow}</p>
      <h1>{copy.forgot.title}</h1>
      <p>{copy.forgot.body}</p>
      <form action="/api/site-admin/recovery" method="post" className="admin-login">
        <input required name="email" type="email" placeholder={copy.subscription.emailPlaceholder} />
        <p>{customerLifecycleCopy[locale].security.recoveryPrivacy} <Link href={`/legal/privacy?lang=${locale}`}>{customerLifecycleCopy[locale].common.privacy}</Link></p>
        <button className="button">{copy.forgot.send}</button>
      </form>
      {(await searchParams).sent ? <p className="success">{copy.forgot.sent}</p> : null}
      <p><Link href="/site-admin/login">{copy.forgot.back}</Link></p>
    </main>
  );
}
