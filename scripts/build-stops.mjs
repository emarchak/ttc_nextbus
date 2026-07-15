#!/usr/bin/env node
/**
 * Builds data/stops.json from the TTC GTFS static feed.
 *
 * Downloads the latest "TTC Routes and Schedules" package from the City of
 * Toronto Open Data portal, extracts stops.txt, and emits a compact
 * [stop_code, name, lat, lon] tuple array used by the /api/stops endpoint.
 *
 * Usage: node scripts/build-stops.mjs
 * Rerun whenever the TTC publishes a GTFS update (a few times per year).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CKAN_PACKAGE_URL =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=ttc-routes-and-schedules";

async function resolveGtfsUrl() {
  const res = await fetch(CKAN_PACKAGE_URL);
  if (!res.ok) throw new Error(`CKAN request failed: ${res.status}`);
  const body = await res.json();
  const zip = body.result.resources.find((r) => r.format === "ZIP");
  if (!zip) throw new Error("No ZIP resource found in CKAN package");
  return zip.url;
}

/** Minimal CSV line parser (handles quoted fields with commas). */
function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

async function main() {
  const gtfsUrl = await resolveGtfsUrl();
  console.log(`Downloading GTFS: ${gtfsUrl}`);

  const workDir = mkdtempSync(join(tmpdir(), "ttc-gtfs-"));
  const zipPath = join(workDir, "gtfs.zip");

  const res = await fetch(gtfsUrl);
  if (!res.ok) throw new Error(`GTFS download failed: ${res.status}`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-o", zipPath, "stops.txt", "-d", workDir]);

  const raw = readFileSync(join(workDir, "stops.txt"), "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((name, i) => [name, i]));

  const stops = [];
  for (const line of lines.slice(1)) {
    const f = parseCsvLine(line);
    const code = f[col.stop_code]?.trim();
    const name = f[col.stop_name]?.trim();
    const lat = Number.parseFloat(f[col.stop_lat]);
    const lon = Number.parseFloat(f[col.stop_lon]);
    if (!code || !name || Number.isNaN(lat) || Number.isNaN(lon)) continue;
    // Compact tuple keeps the bundled dataset small (~9k stops, <500KB).
    stops.push([code, name, Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
  }

  stops.sort((a, b) => Number(a[0]) - Number(b[0]));

  const outPath = new URL("../data/stops.json", import.meta.url).pathname;
  writeFileSync(outPath, JSON.stringify(stops));
  console.log(`Wrote ${stops.length} stops to ${outPath}`);

  rmSync(workDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
