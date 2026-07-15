/**
 * /api/stops — TRMNL xhrSelectSearch endpoint.
 *
 * The TRMNL plugin form sends the user's typed address as a `query` param
 * (POST body by default, query string on GET). We geocode it with
 * Nominatim (OpenStreetMap), then return the nearest TTC stops as
 * [{ id, name }] options, where `id` is the NextBus/UMO stopId used by
 * the recipe's polling URL.
 *
 * If the query already looks like a numeric stop ID, we match it directly —
 * handy for riders who read the 4-5 digit code off the stop pole.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_RESULTS = 10;

/** [stop_code, name, lat, lon][] — built by scripts/build-stops.mjs */
const stops = JSON.parse(
  readFileSync(join(process.cwd(), "data", "stops.json"), "utf8"),
);

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Greater Toronto bounding box keeps geocoding results relevant.
const TORONTO_VIEWBOX = "-79.75,43.85,-79.0,43.55";

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocode(query) {
  // Nominatim is strict about intersection syntax; try progressively
  // normalized variants of what a rider would naturally type.
  const base = query.replace(/\s+/g, " ").trim();
  const withCity = /toronto/i.test(base) ? base : `${base}, Toronto`;
  const candidates = [
    withCity,
    withCity.replace(/\s+(and|at|\/)\s+/gi, " & "),
  ];

  for (const candidate of candidates) {
    const params = new URLSearchParams({
      q: candidate,
      format: "json",
      limit: "1",
      countrycodes: "ca",
      viewbox: TORONTO_VIEWBOX,
      bounded: "1",
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        // Nominatim usage policy requires an identifying User-Agent.
        "User-Agent": "ttc-nextbus-trmnl/1.0 (https://github.com/emarchak/ttc_nextbus)",
      },
    });
    if (!res.ok) continue;
    const results = await res.json();
    if (results[0]) return results[0];
  }
  return null;
}

function nearestStops(lat, lon, limit = MAX_RESULTS) {
  return stops
    .map(([code, name, sLat, sLon]) => ({
      code,
      name,
      km: haversineKm(lat, lon, sLat, sLon),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export default async function handler(req, res) {
  // TRMNL posts from trmnl.com; allow cross-origin form requests.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
  if (req.method === "OPTIONS") return res.status(204).end();

  const query = (req.body?.query ?? req.query?.query ?? "").toString().trim();

  if (!query) {
    return res.status(200).json([
      { id: "", name: "Type an address or intersection to find nearby stops" },
    ]);
  }

  try {
    // Direct stop ID entry (e.g. "6916" printed on the stop pole).
    if (/^\d{1,5}$/.test(query)) {
      const matches = stops
        .filter(([code]) => code.startsWith(query))
        .slice(0, MAX_RESULTS)
        .map(([code, name]) => ({ id: code, name: `${name} (Stop ${code})` }));
      if (matches.length > 0) return res.status(200).json(matches);
    }

    const place = await geocode(query);
    if (!place) {
      return res.status(200).json([
        { id: "", name: `No Toronto location found for “${query}” — try an intersection like “Queen St W and Spadina Ave”` },
      ]);
    }

    const nearby = nearestStops(Number(place.lat), Number(place.lon));
    return res.status(200).json(
      nearby.map(({ code, name, km }) => ({
        id: code,
        name: `${name} — ${formatDistance(km)} (Stop ${code})`,
      })),
    );
  } catch (err) {
    console.error(err);
    return res.status(200).json([
      { id: "", name: "Stop lookup is temporarily unavailable — please try again" },
    ]);
  }
}
