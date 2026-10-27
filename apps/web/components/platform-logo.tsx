/* eslint-disable @next/next/no-img-element -- a white-label logo is supplied by each buyer's public configuration. */
import { platformConfig, platformMark } from "../lib/platform-config";

export function PlatformLogo({ compact = false, tagline = false }: { compact?: boolean; tagline?: boolean }) {
  const { brand } = platformConfig;
  if (brand.logoUrl) {
    const image = <img className={`platform-logo-image${compact ? " compact" : ""}`} src={brand.logoUrl} alt={`${brand.name} logo`} />;
    return tagline ? <span className="platform-brand-lockup">{image}<span>{brand.tagline}</span></span> : image;
  }
  return <><span className="platform-logo-mark">{platformMark}</span>{!compact ? brand.name : null}</>;
}
