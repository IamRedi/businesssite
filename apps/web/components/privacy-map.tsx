"use client";

import { useState } from "react";

export function PrivacyMap({ address, title, directionsUrl, directionsLabel, consentText, loadLabel }: { address: string; title: string; directionsUrl?: string; directionsLabel: string; consentText: string; loadLabel: string }) {
  const [enabled, setEnabled] = useState(false);
  const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  return (
    <div className="map-card">
      <div><div><span>{directionsLabel}</span><strong>{address}</strong></div>{directionsUrl ? <a href={directionsUrl} target="_blank" rel="noreferrer">{directionsLabel} ↗</a> : null}</div>
      {enabled ? (
        <iframe className="site-map" title={title} src={mapUrl} loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="site-map site-map-consent">
          <p>{consentText}</p>
          <button type="button" onClick={() => setEnabled(true)}>{loadLabel}</button>
        </div>
      )}
    </div>
  );
}
