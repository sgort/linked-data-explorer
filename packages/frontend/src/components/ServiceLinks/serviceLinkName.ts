import { ServiceLink } from '../../types';

/**
 * Display name of the other end of a dct:requires link: the DMN identifier
 * when that service has a DMN in the list, else the service title, else the
 * last path segment of the service URI, else the URI itself.
 *
 * Kept out of ServiceLinks.tsx so that file exports only a component
 * (react-refresh/only-export-components).
 */
export function serviceLinkName(link: ServiceLink): string {
  if (link.dmnIdentifier) return link.dmnIdentifier;
  if (link.title) return link.title;
  const tail = link.service.split('/').filter(Boolean).pop();
  return tail && link.service.includes('/') ? tail : link.service;
}
