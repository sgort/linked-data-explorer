/**
 * HTTP clients for hosts a caller chose (#142).
 *
 * The route checks in outboundUrl.ts see only the URL. This module refuses an
 * internal address where it is actually decided: after DNS resolution (so a
 * public-looking name that resolves inward, or whose answer changes between
 * check and request, is caught), on every redirect, and on IP literals, which
 * Node connects to without a lookup at all.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios';
import { config } from './config';
import { isInternalAddress } from './outboundUrl';

export class OutboundRefusedError extends Error {
  readonly code = 'EOUTBOUNDREFUSED';
  constructor(message: string) {
    super(message);
    this.name = 'OutboundRefusedError';
  }
}

const allowLocal = () => config.outbound.allowLocalEndpoints;

type LookupCallback = (
  err: Error | null,
  address?: string | dns.LookupAddress[],
  family?: number
) => void;

export const guardedLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: LookupCallback
) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (!allowLocal() && list.some((a) => isInternalAddress(a.address))) {
      return callback(new OutboundRefusedError(`${hostname} resolves to an internal address`));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}) as unknown as LookupFunction;

function refuse(protocol: string, hostname: string): string | null {
  const schemes = allowLocal() ? ['https:', 'http:'] : ['https:'];
  if (!schemes.includes(protocol)) return `${protocol}//${hostname} must use https`;
  if (!allowLocal() && isInternalAddress(hostname)) return `${hostname} is an internal address`;
  return null;
}

export function assertOutboundUrl(url: string): void {
  const { protocol, hostname } = new URL(url);
  const reason = refuse(protocol, hostname);
  if (reason) throw new OutboundRefusedError(reason);
}

export function guardRedirect(options: { protocol?: string; hostname?: string }): void {
  const reason = refuse(options.protocol ?? '', options.hostname ?? '');
  if (reason) throw new OutboundRefusedError(`Redirect refused: ${reason}`);
}

const httpAgent = new http.Agent({ lookup: guardedLookup });
const httpsAgent = new https.Agent({ lookup: guardedLookup });

export function createOutboundClient(defaults: CreateAxiosDefaults = {}): AxiosInstance {
  const client = axios.create({
    ...defaults,
    httpAgent,
    httpsAgent,
    maxRedirects: 5,
    beforeRedirect: (options) => guardRedirect(options as { protocol?: string; hostname?: string }),
    // axios otherwise reads HTTP(S)_PROXY from the environment and, for https
    // targets, replaces httpsAgent with its own tunnelling agent -- so
    // guardedLookup never runs. `false` after `...defaults` so a passed-in
    // default cannot turn proxying back on.
    proxy: false,
    // Forces the Node `http`/`https` adapter (which honours httpAgent/httpsAgent
    // and `lookup`), rather than the fetch adapter, which ignores both. (#166)
    adapter: 'http',
    // Prevents the HTTP/2 transport, which ignores httpAgent/httpsAgent and
    // `lookup` (even under the `http` adapter above) just as the fetch
    // adapter does. (#166)
    httpVersion: 1,
  });
  client.interceptors.request.use((request) => {
    // A per-request config field can otherwise swap the transport or lookup
    // and bypass the guard entirely: undo that regardless of what defaults or
    // the caller set, before the URL check runs.
    delete request.transport;
    delete request.socketPath;
    delete request.lookup;
    request.proxy = false;
    request.httpAgent = httpAgent;
    request.httpsAgent = httpsAgent;
    // A per-request `httpVersion: 2` or `adapter: 'fetch'` would otherwise
    // override the defaults above and bypass the guarded agents the same way
    // transport/socketPath/lookup do. (#166)
    request.httpVersion = 1;
    request.adapter = 'http';
    assertOutboundUrl(client.getUri(request));
    return request;
  });
  // A refused DNS lookup rejects with an OutboundRefusedError directly, but a
  // refused redirect (via beforeRedirect above) surfaces from axios as
  // ERR_FR_REDIRECTION_FAILURE, with the OutboundRefusedError buried at
  // err.cause.cause. Unwrap it here so both refusals look the same to a
  // caller branching on `code` (#167).
  client.interceptors.response.use(undefined, (error: unknown) => {
    let cause: unknown = error;
    while (cause && typeof cause === 'object') {
      if (cause instanceof OutboundRefusedError) return Promise.reject(cause);
      cause = (cause as { cause?: unknown }).cause;
    }
    return Promise.reject(error);
  });
  return client;
}
