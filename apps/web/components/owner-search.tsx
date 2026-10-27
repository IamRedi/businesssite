"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { SupportedLocale } from "@platform/website-engine";
import { finderCategories, ownerCopy } from "../lib/owner-copy";
const radii = [2, 5, 10, 15, 25, 50];
export function OwnerSearch({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();
  const localizedCopy = ownerCopy[locale] ?? ownerCopy.en;
  const copy = localizedCopy.search;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [locationMode, setLocationMode] = useState<"device" | "address">(
    "address",
  );
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(10);
  const [minRating, setMinRating] = useState(0);
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
    label?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const suggestions = useMemo(() => {
    const matching = finderCategories.filter(
          (item) =>
            !query ||
            item.toLowerCase().includes(query.toLowerCase()) ||
            query.toLowerCase().includes(item.toLowerCase()),
        );
    if (query) return matching.slice(0, 6);
    const featured = ["Tree service", "Medical practice", "Dental practice", "Home care", "Physiotherapy", "Restaurant"] as const;
    return featured.filter((item) => matching.includes(item));
  }, [query]);
  async function useDevice() {
    if (!navigator.geolocation) {
      setMessage(copy.locationUnsupported);
      return;
    }
    setMessage(copy.gettingLocation);
    navigator.geolocation.getCurrentPosition(
      async (result) => {
        const location = { latitude: result.coords.latitude, longitude: result.coords.longitude };
        setPosition(location);
        setLocationMode("device");
        setMessage(copy.findingAddress);
        try {
          const response = await fetch("/api/owner/geocode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ location }) });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error ?? copy.addressFailed);
          const resolved = { ...location, label: body.location.label as string };
          setPosition(resolved);
          setAddress(resolved.label);
          setMessage(copy.deviceReady(resolved.label));
        } catch (error) {
          setMessage(error instanceof Error ? `${error.message} ${copy.deviceReadyWithoutAddress}` : copy.deviceReadyWithoutAddress);
        }
      },
      () =>
        setMessage(
          copy.permissionDenied,
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function search() {
    if (locationMode === "address" && !address.trim()) {
      setMessage(copy.addressRequired);
      return;
    }
    if (locationMode === "device" && !position) {
      setMessage(copy.deviceRequired);
      return;
    }
    setBusy(true);
    setMessage(undefined);
    const response = await fetch("/api/owner/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        category: category || undefined,
        address: locationMode === "address" ? address : undefined,
        location: locationMode === "device" ? position : undefined,
        radius,
        minRating: minRating || undefined,
        maxResults: 20,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.error ?? copy.requestFailed);
      return;
    }
    setMessage(
      copy.result(body.leadIds?.length ?? 0, Boolean(body.cached), body.location?.label),
    );
    router.refresh();
  }
  return (
    <div className="discovery-form">
      <div className="form-top">
        <div className="field grow">
          <label>{copy.lookingFor}</label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.queryPlaceholder}
          />
        </div>
        <div className="field rating">
          <label>{copy.minimumRating}</label>
          <select
            value={minRating}
            onChange={(event) => setMinRating(Number(event.target.value))}
          >
            <option value={0}>{copy.anyRating}</option>
            <option value={4}>4.0+</option>
            <option value={4.5}>4.5+</option>
          </select>
        </div>
      </div>
      <div className="suggestions">
        <span>{copy.suggestedCategories}</span>
        {suggestions.map((item) => (
          <button
            key={item}
            onClick={() => {
              setCategory(item);
              setQuery(item);
            }}
            className={category === item ? "suggestion active" : "suggestion"}
          >
            {localizedCopy.categories[item]}
          </button>
        ))}
      </div>
      <div className="location-card">
        <div>
          <p className="field-label">{copy.searchArea}</p>
          <div className="location-tabs">
            <button
              onClick={() => setLocationMode("address")}
              className={locationMode === "address" ? "active" : ""}
            >
              {copy.streetAddress}
            </button>
            <button
              onClick={useDevice}
              className={locationMode === "device" ? "active" : ""}
            >
              {copy.device}
            </button>
          </div>
        </div>
        <div className="location-input">
          {locationMode === "address" ? (
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder={copy.addressPlaceholder}
            />
          ) : (
            <span>
              {position?.label || (position ? copy.deviceSelected : copy.selectDevice)}
            </span>
          )}
        </div>
        <div className="field radius">
          <label>{copy.radius}</label>
          <select
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          >
            {radii.map((value) => (
              <option key={value} value={value}>
                {value} km
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="search-actions">
        <p>
          {message ||
            copy.locationHint}
        </p>
        <button
          className="button"
          onClick={search}
          disabled={busy || !query.trim()}
        >
          {busy ? copy.searching : copy.submit}
        </button>
      </div>
    </div>
  );
}
