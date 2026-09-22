// scripts/dso-dossier.mjs
// Renders an activity dossier to Markdown.
//
// Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=YYYY-MM-DD] [--out=<path>]
//
// Requires an already-running backend. This script never starts, stops or
// restarts a server.

import fs from 'node:fs';

const BASE = process.env.LDE_API_BASE_URL ?? 'http://localhost:3001';

/** STOP/IMOP content to readable text. */
function plainText(xml) {
  if (!xml) return '';
  return xml
    .replace(/<LiNummer>([\s\S]*?)<\/LiNummer>/g, '$1 ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pct(part, total) {
  return total ? `${Math.round((100 * part) / total)}%` : 'n/a';
}

function renderRuleSet(title, set) {
  if (!set) return `### ${title}\n\nNot present for this activity.\n`;
  return [
    `### ${title}`,
    '',
    `- **Toepasbare regel:** \`${set.identifier}\` (STTR v${set.sttrVersie ?? '?'}, vanaf ${set.begindatum ?? '?'})`,
    set.toestemming ? `- **Toestemming:** ${set.toestemming}` : null,
    `- **Viewer:** ${set.viewerUrl}`,
    '',
  ]
    .filter(Boolean)
    .join('\n');
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

  lines.push('## 3. Decision criteria', '');
  lines.push(renderRuleSet('Conclusie', d.decisionCriteria));
  lines.push('## 4. Submission requirements', '');
  lines.push(renderRuleSet('Indieningsvereisten', d.submissionRequirements));

  lines.push('## Quality profile', '');
  lines.push('Two axes: how much is readable as it stands, and how much the dossier had to recover.', '');
  lines.push('| Dimension | Value |', '|---|---|');
  lines.push(`| Activity identity | ${q.activityIdentity ?? '—'} |`);
  if (q.decisionNaming)
    lines.push(
      `| Decision naming | ${q.decisionNaming.semantic}/${q.decisionNaming.total} semantic, ${q.decisionNaming.opaque} opaque (${pct(q.decisionNaming.opaque, q.decisionNaming.total)}) |`
    );
  if (q.inputNaming)
    lines.push(
      `| Input naming | ${q.inputNaming.semantic}/${q.inputNaming.total} semantic, ${q.inputNaming.opaque} opaque (${pct(q.inputNaming.opaque, q.inputNaming.total)}) |`
    );
  if (q.labelCoverage)
    lines.push(`| Label coverage | ${q.labelCoverage.withQuestion}/${q.labelCoverage.inputs} inputs carry a question |`);
  if (q.refResolvability)
    lines.push(`| Ref resolvability | ${q.refResolvability.resolved} resolved, ${q.refResolvability.dangling} dangling |`);
  if (q.legalTraceability)
    lines.push(
      `| Legal traceability | ${q.legalTraceability.withArticleText}/${q.legalTraceability.rules} rules traced to article text |`
    );
  lines.push('');

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
    console.error('Usage: npm run dso:dossier -- --urn=<urn> [--env=prod] [--date=YYYY-MM-DD] [--out=<path>]');
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

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  await main();
}
