/**
 * Anonymous test deploys to tenant TestOnly (#163), on localhost and ACC only
 * (config.testDeploy.enabled).
 *
 * - A test deploy is refused when one of its decision keys exists outside
 *   TestOnly (untenanted or under another tenant). A key that exists only under
 *   TestOnly deploys again: Operaton adds a new version.
 * - At most `maxPerHour` test deploys per client address per hour.
 * - Every TestOnly deployment is removed `ttlHours` after its own deploy time,
 *   by an hourly sweep.
 *
 * Proven on Operaton 2.1.5 on 9 November 2026: evaluating by key without a
 * tenant never matches a TestOnly copy, so a test deploy cannot answer an
 * untenanted (published) evaluate link.
 */
import type { Request } from 'express';
import { XMLParser } from 'fast-xml-parser';

import { config } from '../utils/config';
import logger from '../utils/logger';
import { operatonService } from './operaton.service';

const HOUR_MS = 60 * 60 * 1000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  isArray: (name) => name === 'decision',
});

/** The `id` of every `<decision>` in a DMN model, any namespace prefix, in document order. */
export function extractDecisionKeys(xml: string): string[] {
  const doc = parser.parse(xml) as { definitions?: { decision?: Array<{ '@_id'?: string }> } };
  return (doc.definitions?.decision ?? [])
    .map((d) => d['@_id'])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** The first key that exists outside TestOnly, or null when every key is free to test. */
export async function findBlockingKey(keys: string[]): Promise<string | null> {
  for (const key of keys) {
    const tenants = await operatonService.findDecisionTenants(key);
    if (tenants.some((t) => t !== config.testDeploy.tenantId)) return key;
  }
  return null;
}

/**
 * The caller's address. Azure App Service passes the client first in
 * X-Forwarded-For, as `ip:port` (`[v6]:port` for IPv6); the port is dropped so
 * the limit counts per address, not per connection.
 */
export function clientAddress(req: Request): string {
  const header = req.headers['x-forwarded-for'];
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
  if (first) {
    const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(first);
    if (bracketed) return bracketed[1];
    const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(first);
    if (v4WithPort) return v4WithPort[1];
    return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

const slots = new Map<string, number[]>();

/** Takes one of the address's hourly test-deploy slots; false when none is left. */
export function takeRateSlot(address: string, now: Date = new Date()): boolean {
  const t = now.getTime();
  const recent = (slots.get(address) ?? []).filter((at) => t - at < HOUR_MS);
  if (recent.length >= config.testDeploy.maxPerHour) {
    slots.set(address, recent);
    return false;
  }
  recent.push(t);
  slots.set(address, recent);
  return true;
}

/** Clears every address's slots. For tests: the limiter is process-wide state. */
export function resetRateSlots(): void {
  slots.clear();
}

/** Deletes every TestOnly deployment older than ttlHours; returns how many went. */
export async function sweepTestDeployments(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - config.testDeploy.ttlHours * HOUR_MS);
  const expired = await operatonService.listDeployments({
    tenantId: config.testDeploy.tenantId,
    before,
  });
  let removed = 0;
  for (const d of expired) {
    try {
      await operatonService.deleteDeployment(d.id);
      removed++;
    } catch (err) {
      logger.warn('Test deploy cleanup: delete failed', {
        deploymentId: d.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return removed;
}

/** Sweeps once now and then every hour, when test deploys are on. */
export function startTestDeployCleanup(): void {
  if (!config.testDeploy.enabled) return;
  const run = (): void => {
    sweepTestDeployments()
      .then((removed) => {
        if (removed > 0) logger.info('Test deploy cleanup', { removed });
      })
      .catch((err) =>
        logger.warn('Test deploy cleanup failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      );
  };
  run();
  setInterval(run, HOUR_MS).unref();
}
