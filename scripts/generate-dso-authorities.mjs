#!/usr/bin/env node
/**
 * generate-dso-authorities.mjs — build the authority list the Activities tab's
 * Level/Authority dropdowns are populated from.
 *
 * The DSO Explorer only ever knew about four hardcoded authorities
 * (LOCATION_PRESETS in DsoExplorer.tsx). Nobody could browse activities for
 * any other municipality, province, water board or ministry. This script
 * regenerates packages/frontend/src/data/dsoAuthorities.json from the open
 * exports of the Dutch government organisations register
 * (organisaties.overheid.nl), which is the same register DSO's own
 * `bestuursorgaan.oin` values resolve against.
 *
 * Each export is one XML document, namespace `p`, containing a flat
 * <p:organisaties> list of TOP-LEVEL organisations. Each top-level
 * organisation may itself nest a <p:organisaties> block of sub-organisations
 * (e.g. "Provinciale Staten" under a provincie) — those nested entries are
 * never read here. fast-xml-parser preserves the tree, so a top-level
 * organisation's own `identificatiecodes` (name, TOOI, OIN) are never
 * confused with a nested sub-organisation's.
 *
 * An organisation is included only if:
 *   - it is a direct (top-level) entry of the export, and
 *   - its `types/type` list contains the level's expected type
 *     (Provincie / Gemeente / Waterschap / Ministerie), and
 *   - it carries an OIN (an ended or not-yet-assigned organisation does not —
 *     confirmed against live data: every entry with an `eindDatum` has no
 *     OIN, and vice versa, so the two checks are redundant in practice but
 *     both are applied since that is the documented contract), and
 *   - it has no `eindDatum` (has not ended).
 *
 * Run: node scripts/generate-dso-authorities.mjs
 *   (wired up as `npm run authorities:generate`)
 *
 * Usage: `docs/…` was not involved — approved directly, see the authorities
 * brief in the operator's scratchpad for the full spec this implements.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";

const OUTPUT_PATH = fileURLToPath(
  new URL("../packages/frontend/src/data/dsoAuthorities.json", import.meta.url),
);

/**
 * One export per authority level. `matchType` is the value that must appear
 * in a top-level organisation's `types/type` list for it to count as this
 * level — nested sub-organisations carry other types (e.g.
 * "Organisatieonderdeel") and are excluded by this check alone, even before
 * the top-level/nested distinction is considered.
 */
const SOURCES = [
  {
    level: "provincie",
    matchType: "Provincie",
    url: "https://organisaties.overheid.nl/archive/exportOO_provincies.xml",
  },
  {
    level: "gemeente",
    matchType: "Gemeente",
    url: "https://organisaties.overheid.nl/archive/exportOO_gemeenten.xml",
  },
  {
    level: "waterschap",
    matchType: "Waterschap",
    url: "https://organisaties.overheid.nl/archive/exportOO_waterschappen.xml",
  },
  {
    level: "rijk",
    matchType: "Ministerie",
    url: "https://organisaties.overheid.nl/archive/exportOO_ministeries.xml",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Keep every value a string. fast-xml-parser's default number coercion
  // would turn a 20-digit OIN like "00000001002306608000" into a JS number
  // and silently drop its leading zeros.
  parseTagValue: false,
  parseAttributeValue: false,
  // Names carry numeric character references (e.g. "&#39;s-Hertogenbosch",
  // "Hunze en Aa&#39;s") that processEntities alone does not decode in this
  // fast-xml-parser version — htmlEntities does.
  htmlEntities: true,
  isArray: (name) =>
    ["organisatie", "type", "resourceIdentifier"].includes(name),
});

function resourceIdentifier(org, naam) {
  const codes = org.identificatiecodes?.resourceIdentifier ?? [];
  return codes.find((c) => c["@_naam"] === naam)?.["#text"];
}

/** The final path segment of a TOOI URI, e.g. ".../provincie/pv28" -> "pv28". */
function codeFromTooi(tooiUri) {
  return tooiUri.split("/").filter(Boolean).pop();
}

async function fetchAuthorities({ level, matchType, url }) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  const xml = await res.text();
  const doc = parser.parse(xml);
  const topLevel = doc.overheidsorganisaties?.organisaties?.organisatie ?? [];

  const authorities = [];
  const skipped = [];

  for (const org of topLevel) {
    const types = org.types?.type ?? [];
    if (!types.includes(matchType)) continue;

    const name = org.naam?.trim();
    if (org.eindDatum) {
      skipped.push({ name, reason: `ended (${org.eindDatum})` });
      continue;
    }
    const oin = resourceIdentifier(org, "OIN");
    if (!oin) {
      skipped.push({ name, reason: "no OIN" });
      continue;
    }
    const tooi = resourceIdentifier(org, "resourceIdentifierTOOI");
    if (!tooi) {
      skipped.push({ name, reason: "no resourceIdentifierTOOI" });
      continue;
    }

    authorities.push({ level, name, code: codeFromTooi(tooi), oin });
  }

  return { authorities, skipped };
}

const allAuthorities = [];
let anySkipped = false;

for (const source of SOURCES) {
  const { authorities, skipped } = await fetchAuthorities(source);
  allAuthorities.push(...authorities);
  console.log(
    `${source.level}: ${authorities.length} included, ${skipped.length} skipped`,
  );
  for (const s of skipped) {
    anySkipped = true;
    console.log(`  skipped: ${s.name} — ${s.reason}`);
  }
}

// No duplicate OINs — fail loudly rather than write a list an OIN lookup
// could resolve ambiguously.
const seen = new Map();
const duplicates = [];
for (const a of allAuthorities) {
  if (seen.has(a.oin)) {
    duplicates.push(`${a.oin}: ${seen.get(a.oin)} / ${a.name}`);
  } else {
    seen.set(a.oin, a.name);
  }
}
if (duplicates.length > 0) {
  console.error(
    `\n${duplicates.length} duplicate OIN(s) found — refusing to write:`,
  );
  for (const d of duplicates) console.error(`  ${d}`);
  process.exit(1);
}

allAuthorities.sort((a, b) => {
  if (a.level !== b.level) return a.level.localeCompare(b.level);
  return a.name.localeCompare(b.name, "nl");
});

const output = {
  source: `organisaties.overheid.nl export, generated ${new Date().toISOString()} by scripts/generate-dso-authorities.mjs`,
  authorities: allAuthorities,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

console.log(
  `\nWrote ${allAuthorities.length} authorities to ` +
    `packages/frontend/src/data/dsoAuthorities.json` +
    (anySkipped ? " (see skipped entries above)" : ""),
);
