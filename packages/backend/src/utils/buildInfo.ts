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

/**
 * The running build, read ONCE AT MODULE LOAD and never again.
 *
 * Not lazily on first use, which is what this did until 24 September 2026. The
 * comment then claimed the file 'cannot change without a redeploy, which
 * restarts the process'. It can: a zip deploy overwrites build-info.json while
 * the previous process is still serving, and the restart comes afterwards.
 *
 * So a lazy read let the OLD process report the NEW build the moment something
 * first asked -- and the first thing to ask is the deploy's own build.sha
 * check. That is a false pass in the gate whose entire purpose is to prove the
 * new build is serving. Seen on the production promotion of e71c4a4: build.sha
 * read as the new commit while version, bound at module load, still read
 * 2026.09.5. One process; the App Service plan has capacity 1.
 *
 * Reading here binds this to the same moment as `import packageJson`, so the
 * two cannot disagree and a stale process can only report what it started with.
 * ronl-business-api's equivalent has always done this, by accident of style.
 */
const loaded: BuildInfo = readBuildInfo();

export function getBuildInfo(): BuildInfo {
  return loaded;
}
