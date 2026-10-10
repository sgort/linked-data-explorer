import fs from 'fs';
import path from 'path';
import mirroredBundles from './__fixtures__/mirrored-bundles.json';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples', 'organizations');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'e2e-fixtures');

/**
 * Bundles authored under examples/ and mirrored into e2e-fixtures/.
 * examples/ is where a bundle is written; e2e-fixtures/ is what LDE imports
 * and deploys. The two must stay byte-identical - 49832d2 fixed the document
 * zone keys in the fixtures copy alone and the examples copy stayed broken
 * until 44d1cb4 re-pasted it by hand.
 *
 * The list lives in __fixtures__/mirrored-bundles.json because
 * public-example-fixture-parity.test.ts reads it too. An entry with `files`
 * mirrors only those files of its examples directory: the Heusden DMNs sit
 * beside sources that are not part of the fixture bundle.
 */
const MIRRORED_BUNDLES: Array<{ examples: string; fixtures: string; files?: string[] }> =
  mirroredBundles;

describe('examples/ and e2e-fixtures/ copies stay identical', () => {
  for (const bundle of MIRRORED_BUNDLES) {
    describe(bundle.examples, () => {
      const examplesDir = path.join(EXAMPLES_ROOT, ...bundle.examples.split('/'));

      it('has an examples directory with files in it', () => {
        expect(fs.existsSync(examplesDir)).toBe(true);
        expect(fs.readdirSync(examplesDir).length).toBeGreaterThan(0);
      });

      it('mirrors every file into e2e-fixtures byte for byte', () => {
        const files =
          bundle.files ??
          fs
            .readdirSync(examplesDir)
            .filter((f) => fs.statSync(path.join(examplesDir, f)).isFile());

        const mismatches: string[] = [];
        for (const file of files) {
          const fixturePath = path.join(FIXTURES_ROOT, bundle.fixtures, file);
          if (!fs.existsSync(fixturePath)) {
            mismatches.push(`${file}: missing from e2e-fixtures/${bundle.fixtures}/`);
            continue;
          }
          const a = fs.readFileSync(path.join(examplesDir, file));
          const b = fs.readFileSync(fixturePath);
          if (!a.equals(b)) {
            mismatches.push(`${file}: content differs between examples/ and e2e-fixtures/`);
          }
        }

        expect(mismatches).toEqual([]);
      });
    });
  }
});

const PUBLIC_ROOT = path.join(REPO_ROOT, 'packages', 'frontend', 'public', 'examples');

/**
 * examples/organizations/<tenant>/ holds the authored copy of every bundle for
 * that tenant; packages/frontend/public/examples/<tenant>/ serves a subset of
 * them to the Modeler (and e2e-fixtures/ a labelled subset of that, which
 * public-example-fixture-parity.test.ts guards). So every public file must have
 * an authored copy, byte for byte.
 *
 * Matched by file name rather than path, because the authored tree groups
 * bundles in their own folders (thuisbatterij/, besluitvorming-gedelegeerd/)
 * where public/examples keeps most of them flat. A name that occurs twice in
 * the authored tree is an error: the copy to compare against must be
 * unambiguous.
 *
 * Before this test (#192) nothing tied the authored tree to what was served or
 * deployed, and it drifted: awb-completeness-check.dmn lost the Thuisbatterij
 * rule, so a Thuisbatterij application deployed from it was declared
 * inadmissible, and three bundles had no authored copy at all.
 */
const AUTHORED_TENANTS = ['flevoland'];

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? filesUnder(p) : [p];
  });
}

describe('public/examples has an authored copy in examples/organizations', () => {
  for (const tenant of AUTHORED_TENANTS) {
    it(`every public/examples/${tenant} file matches its authored copy`, () => {
      const publicFiles = filesUnder(path.join(PUBLIC_ROOT, tenant));
      const authored = new Map<string, string[]>();
      for (const f of filesUnder(path.join(EXAMPLES_ROOT, tenant))) {
        const name = path.basename(f);
        authored.set(name, [...(authored.get(name) ?? []), f]);
      }

      expect(publicFiles.length).toBeGreaterThan(20);
      const problems: string[] = [];
      for (const pub of publicFiles) {
        const rel = path.relative(PUBLIC_ROOT, pub).split(path.sep).join('/');
        const copies = authored.get(path.basename(pub)) ?? [];
        if (copies.length !== 1) {
          problems.push(
            `${rel}: ${copies.length === 0 ? 'no' : `${copies.length}`} authored cop${copies.length === 1 ? 'y' : 'ies'} in examples/organizations/${tenant}/`
          );
          continue;
        }
        if (!fs.readFileSync(pub).equals(fs.readFileSync(copies[0]))) {
          const authoredRel = path.relative(EXAMPLES_ROOT, copies[0]).split(path.sep).join('/');
          problems.push(`${rel}: differs from examples/organizations/${authoredRel}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
