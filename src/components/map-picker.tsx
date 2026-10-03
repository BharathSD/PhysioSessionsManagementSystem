"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

// OpenStreetMap: free, no API key. Their usage policy asks for light use —
// lookups here only happen when the physio taps a button, never while typing.
const OSM = "https://nominatim.openstreetmap.org";
export type OsmAddress = Record<string, string | undefined>;
type Result = { display_name: string; lat: string; lon: string };

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Pan the map until the pin sits on the patient's home, then "Use this spot".
 * The pin stays in the middle (like food-delivery apps), so there's nothing to drag.
 */
export function MapPicker({
  start,
  country,
  onPick,
  onClose,
}: {
  start: { lat: number; lng: number } | null;
  country: string;
  onPick: (lat: number, lng: number, osm: OsmAddress | null) => void;
  onClose: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState<"" | "search" | "locate" | "pick">("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map.current = L.map(el.current).setView(start ? [start.lat, start.lng] : [22.6, 79.0], start ? 17 : 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map.current);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; later pins move it rather than rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    if (!query.trim()) return;
    setBusy("search");
    setProblem("");
    try {
      const params = new URLSearchParams({ format: "jsonv2", limit: "5", "accept-language": "en", q: query });
      if (country) params.set("countrycodes", country.toLowerCase());
      const res = await fetch(`${OSM}/search?${params}`);
      const found: Result[] = res.ok ? await res.json() : [];
      setResults(found);
      if (found.length === 1) goTo(found[0]);
    } catch {
      setProblem("Couldn't search right now. Move the map by hand instead.");
    } finally {
      setBusy("");
    }
  }

  function goTo(r: Result) {
    map.current?.setView([Number(r.lat), Number(r.lon)], 17);
    setResults(null);
  }

  function locate() {
    if (!navigator.geolocation) return setProblem("This device can't share its location.");
    setBusy("locate");
    setProblem("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 18);
        setBusy("");
      },
      () => {
        setProblem("Location is off or not allowed. Search for the area instead.");
        setBusy("");
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  async function pick() {
    const c = map.current?.getCenter();
    if (!c) return;
    const [lat, lng] = [round(c.lat), round(c.lng)];
    setBusy("pick");
    let osm: OsmAddress | null = null;
    try {
      const params = new URLSearchParams({ format: "jsonv2", addressdetails: "1", zoom: "18", "accept-language": "en", lat: String(lat), lon: String(lng) });
      const res = await fetch(`${OSM}/reverse?${params}`);
      if (res.ok) osm = (await res.json()).address ?? null;
    } catch {
      // The pin is still saved; the address is typed by hand.
    }
    setBusy("");
    onPick(lat, lng, osm);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface-2 p-3">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Enter searches the map; it must not submit the patient form around it.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Search area, building or landmark"
          aria-label="Search the map"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-base"
        />
        <button type="button" onClick={search} className="btn shrink-0" disabled={busy === "search"}>
          {busy === "search" ? "…" : "Search"}
        </button>
      </div>
      {results && (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface text-sm">
          {results.length === 0 && <li className="px-3 py-2 text-muted">Nothing found. Try the area or a landmark nearby.</li>}
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`} className="border-t border-border first:border-t-0">
              <button type="button" onClick={() => goTo(r)} className="w-full px-3 py-2 text-left">
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative isolate h-72 overflow-hidden rounded-xl sm:h-80">
        <div ref={el} className="h-full w-full" />
        {/* The pin: its tip marks the spot that gets saved. */}
        <svg viewBox="0 0 24 36" className="pointer-events-none absolute top-1/2 left-1/2 z-[1000] size-9 -translate-x-1/2 -translate-y-full" aria-hidden>
          <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="var(--bad)" stroke="white" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="4.5" fill="white" />
        </svg>
      </div>
      <p className="text-sm text-muted">Move the map so the pin sits on the patient&apos;s home. Pinch or use + / − to zoom.</p>
      {problem && <p className="text-sm text-bad">{problem}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={locate} className="btn" disabled={busy === "locate"}>
          {busy === "locate" ? "Finding you…" : "📍 I'm there now"}
        </button>
        <button type="button" onClick={pick} className="btn btn-primary" disabled={busy === "pick"}>
          {busy === "pick" ? "Saving…" : "Use this spot"}
        </button>
      </div>
      <button type="button" onClick={onClose} className="w-full py-1 text-sm text-muted">
        Cancel
      </button>
    </div>
  );
}
