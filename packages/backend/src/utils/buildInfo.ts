// packages/backend/src/utils/buildInfo.ts
//
// Which BUILD of the backend is running, as opposed to which release.
//
// `version` comes from package.json, which changes only when a release is cut,
// so every deploy between two releases reports the same string (#122). The
// deploy workflows write build-info.json into the artifact they upload — see
// "Prepare deployment package" in .github/workflows/azure-backend-{acc,production}.yml.
//
// The identity travels in a file inside the artifact, not in App Service
// settings, which persist across deploys and can describe a build that is not
// the one running. Nothing is derived from git either: the artifact has no
// .git, and a build id that silently fails to resolve lies.
//
// Same shape and semantics as the frontend's src/utils/buildInfo.ts, so the two
// surfaces agree.

import fs from 'fs';
import path from 'path';

export interface BuildInfo {
  /** Full 40-character commit SHA, or '' when not recorded. */
  sha: string;
  /** First 7 characters of the SHA, or '' when not recorded. */
  shortSha: string;
  /** GitHub Actions run number, or '' when not recorded. */
  run: string;
  /** True only when both values are present — see readBuildInfo. */
  isTracked: boolean;
  /** Ready to render. Never blank. */
  label: string;
}

/**
 * <package root>/build-info.json. From src/utils that is packages/backend; from
 * dist/utils in the deployed artifact it is deploy/ — the same relative step
 * that resolves ../../package.json in both places.
 */
export const BUILD_INFO_PATH = path.resolve(__dirname, '../../build-info.json');

function untracked(): BuildInfo {
  return { sha: '', shortSha: '', run: '', isTracked: false, label: 'local build' };
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read and describe the recorded build.
 *
 * Never throws. A missing file is the normal case in local development and
 * tests, and an unreadable or malformed one must not fail the health check —
 * all of them report 'local build'.
 *
 * Half-configured counts as untracked. A run number with no SHA behind it
 * implies a provenance the build does not have, and a SHA with no run number
 * cannot tell two builds of the same commit apart.
 */
export function readBuildInfo(file: string = BUILD_INFO_PATH): BuildInfo {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return untracked();
  }

  if (typeof parsed !== 'object' || parsed === null) return untracked();

  const record = parsed as Record<string, unknown>;
  const sha = stringField(record, 'sha');
  const run = stringField(record, 'run');

  if (!sha || !run) return untracked();

  const shortSha = sha.slice(0, 7);
  return { sha, shortSha, run, isTracked: true, label: `build ${shortSha} · #${run}` };
}

let cached: BuildInfo | undefined;

/**
 * The running build, read once on first use. The file is part of the artifact
 * and cannot change without a redeploy, which restarts the process.
 */
export function getBuildInfo(): BuildInfo {
  cached ??= readBuildInfo();
  return cached;
}
