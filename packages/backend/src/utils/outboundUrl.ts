/**
 * Route-level checks for URLs a caller asks the backend to request (#142).
 *
 * These run before any outbound request, so a refused target gets a clear 400.
 * They cannot see what a hostname resolves to; outboundHttp.ts refuses internal
 * addresses again at connect time, after DNS resolution.
 */
import { BlockList, isIP } from 'node:net';
import type { Request, Response } from 'express';
import { config } from './config';
import { sendProblem } from './problem';

export type OutboundCheck = { ok: true; url: URL } | { ok: false; reason: string };

const internalV4 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  internalV4.addSubnet(net, prefix, 'ipv4');
}

// `::ffff:0:0/96` (the IPv4-mapped range) is deliberately NOT added here. Node's
// `BlockList.check(address, family)` does documented cross-family matching: an
// ipv4-mapped ipv6 subnet in the same list also matches plain ipv4 checks (and
// an ipv4 subnet matches an ipv6 check in its mapped `::ffff:` form). Mixing the
// two families in one `BlockList` therefore stops `check(ip, 'ipv4')` from being
// ipv4-only -- keeping `internalV4` and `internalV6` separate keeps each
// family's `check()` exact. IPv4-mapped, IPv4-compatible, NAT64 and 6to4
// addresses are decoded to their embedded IPv4 below instead and checked
// against `internalV4`.
const internalV6 = new BlockList();
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  internalV6.addSubnet(net, prefix, 'ipv6');
}

/** Expand any textual IPv6 form (`::` compression, trailing dotted quad) to eight 16-bit groups. */
function expandIPv6(addr: string): number[] | null {
  let a = addr;
  const parts = a.split(':');
  const last = parts[parts.length - 1];
  if (last.includes('.')) {
    if (isIP(last) !== 4) return null;
    const octets = last.split('.').map(Number);
    parts[parts.length - 1] = (((octets[0] << 8) | octets[1]) >>> 0).toString(16);
    parts.push((((octets[2] << 8) | octets[3]) >>> 0).toString(16));
    a = parts.join(':');
  }
  const halves = a.split('::');
  if (halves.length > 2) return null;
  let groups: string[];
  if (halves.length === 1) {
    groups = a.split(':');
    if (groups.length !== 8) return null;
  } else {
    const head = halves[0] ? halves[0].split(':').filter((s) => s.length) : [];
    const tail = halves[1] ? halves[1].split(':').filter((s) => s.length) : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;
  const nums = groups.map((h) => parseInt(h, 16));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;
  return nums;
}

const ipv4FromGroups = (hi: number, lo: number): string =>
  `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;

/**
 * The IPv4 address embedded in an IPv4-mapped (`::ffff:0:0/96`), IPv4-compatible
 * (`::/96`, e.g. `::a.b.c.d` -- this also covers `::` and `::1`, which decode to
 * 0.0.0.0 and 0.0.0.1 and so stay internal via the ipv4 rules), NAT64
 * (`64:ff9b::/96`) or 6to4 (`2002::/16`, IPv4 in bits 16-47) IPv6 address, or
 * `null` if it is none of those.
 */
function embeddedIPv4(hostname: string): string | null {
  const groups = expandIPv6(hostname);
  if (!groups) return null;
  const first5Zero =
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
  if (first5Zero && groups[5] === 0xffff) return ipv4FromGroups(groups[6], groups[7]); // IPv4-mapped
  if (first5Zero && groups[5] === 0) return ipv4FromGroups(groups[6], groups[7]); // IPv4-compatible
  const isNat64 =
    groups[0] === 0x64 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0;
  if (isNat64) return ipv4FromGroups(groups[6], groups[7]);
  if (groups[0] === 0x2002) return ipv4FromGroups(groups[1], groups[2]); // 6to4
  return null;
}

/** Loopback, private, link-local/metadata, CGNAT, multicast, reserved, and IPv4 embedded in IPv6. */
export function isInternalAddress(ip: string): boolean {
  // Strip brackets (`[fe80::1]`) and a zone id (`fe80::1%eth0`) before any parsing:
  // `isIP`/`BlockList.check` tolerate a zone id on some forms but not on the
  // hand-parsed embedded-IPv4 forms below, which would otherwise silently miss it.
  const bare = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const family = isIP(bare);
  if (family === 4) return internalV4.check(bare, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIPv4(bare);
    if (v4) return internalV4.check(v4, 'ipv4');
    return internalV6.check(bare, 'ipv6');
  }
  return false;
}

function parse(value: unknown, field: string): OutboundCheck {
  if (typeof value !== 'string') return { ok: false, reason: `\`${field}\` must be a string` };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `\`${field}\` is not a valid URL` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: `\`${field}\` must not contain credentials` };
  }
  return { ok: true, url };
}

/**
 * `localhost` and its subdomains resolve to loopback by definition (RFC 6761).
 * A single trailing `.` (a fully-qualified DNS name, e.g. `localhost.`) is
 * stripped first: it still resolves to loopback, so it must not slip past
 * these string comparisons unmatched.
 */
function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || isInternalAddress(host);
}

export function checkSparqlEndpoint(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  const local = config.outbound.allowLocalEndpoints;
  const schemes = local ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(url.protocol)) return { ok: false, reason: `\`${field}\` must use https` };
  if (!local && isInternalHost(url.hostname)) {
    return { ok: false, reason: `\`${field}\` points to an internal address` };
  }
  return parsed;
}

export function checkTriplyDbBaseUrl(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  const { url } = parsed;
  if (url.protocol !== 'https:') return { ok: false, reason: `\`${field}\` must use https` };
  if (!config.outbound.triplydbAllowedHosts.includes(url.hostname.toLowerCase())) {
    return {
      ok: false,
      reason: `\`${field}\` host ${url.hostname} is not an allowed TriplyDB host`,
    };
  }
  return parsed;
}

const withoutTrailingSlash = (s: string) => s.replace(/\/+$/, '');

export function checkOperatonTarget(value: unknown, field: string): OutboundCheck {
  const parsed = parse(value, field);
  if (!parsed.ok) return parsed;
  // Normalise the configured value through `new URL` too, so a mixed-case host
  // or an explicit default port in OPERATON_BASE_URL doesn't refuse itself; if
  // it doesn't parse, fall back to the raw configured string for the message.
  let configured: string;
  try {
    configured = withoutTrailingSlash(new URL(config.operaton.baseUrl).href);
  } catch {
    configured = withoutTrailingSlash(config.operaton.baseUrl);
  }
  if (withoutTrailingSlash(parsed.url.href) !== configured) {
    return {
      ok: false,
      reason: `\`${field}\` must be omitted or equal the configured Operaton, ${configured}`,
    };
  }
  return parsed;
}

export function refuseTarget(res: Response, req: Request, check: OutboundCheck): boolean {
  if (check.ok) return false;
  sendProblem(res, req, { status: 400, code: 'INVALID_INPUT', detail: check.reason });
  return true;
}

export function refuseOptionalEndpoint(
  res: Response,
  req: Request,
  value: unknown,
  field: string
): boolean {
  if (value === undefined || value === '') return false;
  return refuseTarget(res, req, checkSparqlEndpoint(value, field));
}
