// scripts/dso-dossier.mjs
// Renders an activity dossier to Markdown.
//
// Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=dd-MM-yyyy] [--authority=<code>] [--out=<path>]
//
// Requires an already-running backend. This script never starts, stops or
// restarts a server.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = process.env.LDE_API_BASE_URL ?? 'http://localhost:3001';

/**
 * STOP/IMOP content to readable text.
 *
 * CDATA is unwrapped *before* the generic tag strip: `<![CDATA[...]]>`
 * contains no `>` until its own terminator, so a naive `/<[^>]+>/g` treats
 * the whole span as one tag and deletes the payload along with it. Article
 * text comes from the same STOP/IMOP pipeline as the DMN `vraagTekst` and
 * `inputExpression` content that `quality.service.ts` and `dso.service.ts`
 * already have to handle this way — see those for the same anti-pattern.
 */
function plainText(xml) {
  if (!xml) return '';
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<LiNummer>([\s\S]*?)<\/LiNummer>/g, '$1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pct(part, total) {
  return total ? `${Math.round((100 * part) / total)}%` : 'n/a';
}

/**
 * A table cell must not contain a raw `|` (it would end the cell early and
 * shift every following column) or a newline (it would end the row). Both are
 * plausible in a decision/input name or a vraagTekst question, so every value
 * that reaches a table goes through this first.
 */
function escapeCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

/**
 * The evidence behind the naming-split counts: one row per decision and per
 * input, so a municipality can see WHICH item scored how, not just how many.
 * `rsq` is the rule set's slice of the quality profile (`ruleSets.conclusie`
 * or `ruleSets.indieningsvereisten`); `null` when the DMN itself could not be
 * measured (e.g. it failed to extract), in which case this renders nothing
 * rather than crashing on missing fields.
 */
function renderEvidence(rsq) {
  if (!rsq) return [];
  const { decisionNaming, inputNaming } = rsq;
  const lines = [
    '',
    '**Decisions**',
    '',
    '| Decision | Naming |',
    '|---|---|',
  ];
  for (const item of decisionNaming.items) {
    lines.push(`| ${escapeCell(item.name)} | ${item.class} |`);
  }
  lines.push('', '**Inputs**', '', '| Input | Naming | Question |', '|---|---|---|');
  for (const item of inputNaming.items) {
    lines.push(`| ${escapeCell(item.name)} | ${item.class} | ${escapeCell(item.question)} |`);
  }
  lines.push('');
  return lines;
}

function renderRuleSet(title, set, rsq) {
  if (!set) return `### ${title}\n\nNot present for this activity.\n`;
  const lines = [
    rsq
      ? `### ${title} — ${rsq.decisionNaming.total} decisions, ${rsq.inputNaming.total} inputs`
      : `### ${title}`,
    '',
    `- **Toepasbare regel:** \`${set.identifier}\` (STTR v${set.sttrVersie ?? '?'}, vanaf ${set.begindatum ?? '?'})`,
    set.toestemming ? `- **Toestemming:** ${set.toestemming}` : null,
    `- **Viewer:** ${set.viewerUrl}`,
    '',
  ].filter(Boolean);
  return [...lines, ...renderEvidence(rsq)].join('\n');
}

/**
 * The Quality profile's per-rule-set figures: since a dossier can carry two
 * DMNs (Conclusie, Indieningsvereisten) with different naming and coverage,
 * a single blended table would hide exactly the comparison it exists to
 * show. `Not present.` for a rule set whose DMN was never measured.
 */
function renderRuleSetQualityTable(title, rsq) {
  if (!rsq) return [`**${title}:** Not present.`, ''];
  const { decisionNaming: dn, inputNaming: inp, labelCoverage: lc, refResolvability: rr } = rsq;
  return [
    `**${title}**`,
    '',
    '| Dimension | Value |',
    '|---|---|',
    `| Decision naming | ${dn.semantic}/${dn.total} semantic, ${dn.opaque} opaque (${pct(dn.opaque, dn.total)}) |`,
    `| Input naming | ${inp.semantic}/${inp.total} semantic, ${inp.opaque} opaque (${pct(inp.opaque, inp.total)}) |`,
    `| Label coverage | ${lc.withQuestion}/${lc.inputs} inputs carry a question |`,
    `| Ref resolvability | ${rr.resolved} resolved, ${rr.dangling} dangling |`,
    '',
  ];
}

export function renderDossier(d) {
  const q = d.qualityProfile ?? {};
  const rules = d.legalSource?.juridischeRegels ?? [];

  const lines = [
    `# ${d.omschrijving ?? d.urn}`,
    '',
    `**URN:** \`${d.urn}\`  `,
    `**Authority:** ${d.bestuursorgaan?.code ?? '?'} (OIN ${d.bestuursorgaan?.oin ?? '?'})  `,
    `**Environment:** ${d.provenance?.env}  `,
    `**Valid on:** ${d.provenance?.datum ?? 'today'}  `,
    `**Retrieved:** ${d.provenance?.fetchedAt}`,
    '',
    '> Environment and date are part of the result: the same activity differs',
    '> between pre-production and production, and rule ids do not carry across.',
    '',
    '## 1. Legal source',
    '',
  ];

  if (!d.legalSource?.available) {
    lines.push('No omgevingsplan was found for this authority.', '');
  } else {
    lines.push(`Regeling: **${d.legalSource.regelingTitel ?? d.legalSource.regelingIdentificatie}**`, '');
    lines.push(`${rules.length} juridische regels reference this activity.`, '');
    for (const r of rules) {
      lines.push(`#### ${r.wId ?? r.identificatie}`, '');
      lines.push(`- **Kwalificatie:** ${r.kwalificatie ?? '—'}`);
      const locs = r.locaties.map((l) => `${l.naam ?? l.identificatie}`).join(', ');
      lines.push(`- **Werkingsgebied:** ${locs || '—'}`);
      if (r.articleText) lines.push('', `> ${plainText(r.articleText)}`);
      lines.push('');
    }
  }

  lines.push('## 2. Annotation', '');
  lines.push(`- **Groep:** ${d.annotation?.groep ?? '—'}`);
  lines.push(`- **Parent activity:** \`${d.annotation?.bovenliggendeActiviteitRef ?? '—'}\``);
  lines.push('');

  const ruleSets = q.ruleSets ?? {};

  lines.push('## 3. Decision criteria', '');
  lines.push(renderRuleSet('Conclusie', d.decisionCriteria, ruleSets.conclusie));
  lines.push('## 4. Submission requirements', '');
  lines.push(renderRuleSet('Indieningsvereisten', d.submissionRequirements, ruleSets.indieningsvereisten));

  lines.push('## Quality profile', '');
  lines.push('Two axes: how much is readable as it stands, and how much the dossier had to recover.', '');
  lines.push('| Dimension | Value |', '|---|---|');
  lines.push(`| Activity identity | ${q.activityIdentity ?? '—'} |`);
  if (q.legalTraceability)
    lines.push(
      `| Legal traceability | ${q.legalTraceability.withArticleText}/${q.legalTraceability.rules} rules traced to article text |`
    );
  lines.push('');
  // The naming-split, label-coverage and ref-resolvability figures live per
  // rule set now — a blended table would average away exactly the contrast
  // (e.g. an opaque-but-labelled Conclusie next to a fully semantic
  // Indieningsvereisten) that the profile exists to surface.
  lines.push(...renderRuleSetQualityTable('Conclusie', ruleSets.conclusie));
  lines.push(...renderRuleSetQualityTable('Indieningsvereisten', ruleSets.indieningsvereisten));

  const failures = d.provenance?.failures ?? [];
  if (failures.length) {
    lines.push('## Incomplete legs', '');
    for (const f of failures) lines.push(`- **${f.step}:** ${f.detail}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    })
  );

  if (!args.urn) {
    console.error(
      'Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=dd-MM-yyyy] [--authority=<code>] [--out=<path>]'
    );
    process.exit(2);
  }

  const params = new URLSearchParams();
  if (args.date) params.set('datum', args.date);
  if (args.authority) params.set('authority', args.authority);
  const url = `${BASE}/v1/dso/activiteiten/${encodeURIComponent(args.urn)}/dossier?${params}`;

  let res;
  try {
    res = await fetch(url, { headers: { 'X-Dso-Env': args.env === 'prod' ? 'prod' : 'pre' } });
  } catch {
    console.error(
      `Cannot reach the LDE backend at ${BASE}. Start it yourself, or set LDE_API_BASE_URL. This script does not manage servers.`
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`Backend answered ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { data } = await res.json();
  const md = renderDossier(data);

  if (args.out) {
    fs.writeFileSync(args.out, md, 'utf8');
    console.log(`Written to ${args.out}`);
  } else {
    console.log(md);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
