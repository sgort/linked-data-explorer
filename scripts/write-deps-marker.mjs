// Snapshots package-lock.json into node_modules right after a successful
// install, so scripts/check-deps.sh can later ask "does the lockfile on disk
// still match what was actually installed?" by comparing content rather than
// file mtimes. `git checkout` and `git merge --ff-only` rewrite tracked files
// even when their content is unchanged, so an mtime says nothing about whether
// dependencies moved.
//
// Node, not bash. This runs as the root "postinstall", and npm runs root
// lifecycle scripts even when the install starts in a workspace. Until #119
// that included the Static Web Apps build, where Oryx ran `npm install` in
// /packages/frontend inside the staticappsclient container, which has no shell
// this repository can rely on. The frontend now builds on the runner with
// skip_app_build, so that no longer applies; Node stays because it is the one
// runtime every install is guaranteed to have.
import { copyFileSync } from 'node:fs';

copyFileSync('package-lock.json', 'node_modules/.package-lock-installed.json');
