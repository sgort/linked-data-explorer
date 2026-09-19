/**
 * Deploy Target Service
 *
 * Fetches the Operaton the backend actually deploys BPMN processes to, from
 * `GET /v1/dmns/process/deploy-target` (#165) — replacing the frontend's own
 * build-time `VITE_OPERATON_BASE_URL`, which can drift from the backend's
 * configured `OPERATON_BASE_URL`.
 *
 * A successful answer is cached for the session, so opening the deploy modal
 * repeatedly does not refetch. A failure is not cached: the next call asks
 * again, so the modal names the target once the backend is reachable.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let cached: Promise<string | null> | null = null;

async function fetchDeployTarget(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/dmns/process/deploy-target`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      success: boolean;
      data?: { operatonUrl?: string };
    };
    return data.data?.operatonUrl ?? null;
  } catch (err) {
    console.warn('[deployTargetService] Failed to fetch deploy target:', err);
    return null;
  }
}

/**
 * The Operaton the backend deploys to, or `null` when the backend has none
 * configured or could not be reached. Never rejects. A non-null answer is
 * cached for the session; `null` is not.
 */
export function getDeployTarget(): Promise<string | null> {
  if (!cached) {
    const pending = fetchDeployTarget();
    cached = pending;
    void pending.then((target) => {
      if (target === null && cached === pending) cached = null;
    });
  }
  return cached;
}
