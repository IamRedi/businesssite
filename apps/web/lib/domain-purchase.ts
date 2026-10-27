export type DomainRegistrarLink = {
  name: string;
  url: string;
};

export function configuredDomainRegistrar(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DomainRegistrarLink | null {
  const rawUrl = environment.DOMAIN_REGISTRAR_URL?.trim();
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    return {
      name: environment.DOMAIN_REGISTRAR_NAME?.trim() || url.hostname.replace(/^www\./, ""),
      url: url.toString(),
    };
  } catch {
    return null;
  }
}
