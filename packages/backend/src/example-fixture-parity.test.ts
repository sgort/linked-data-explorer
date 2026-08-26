import fs from 'fs';
import path from 'path';

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'examples', 'organizations');
const FIXTURES_ROOT = path.join(REPO_ROOT, 'e2e-fixtures');

/**
 * Bundles authored under examples/ and mirrored into e2e-fixtures/.
 * examples/ is where a bundle is written; e2e-fixtures/ is what LDE imports
 * and deploys. The two must stay byte-identical - 39a49bb fixed the document
 * zone keys in the fixtures copy alone and the examples copy stayed broken
 * until 44d1cb4 re-pasted it by hand.
 */
const MIRRORED_BUNDLES: Array<{ examples: string; fixtures: string }> = [
  { examples: 'flevoland/rip-phase-21', fixtures: 'flevoland' },
  { examples: 'flevoland/rip-phase-22', fixtures: 'flevoland' },
];

describe('examples/ and e2e-fixtures/ copies stay identical', () => {
  for (const bundle of MIRRORED_BUNDLES) {
    describe(bundle.examples, () => {
      const examplesDir = path.join(EXAMPLES_ROOT, ...bundle.examples.split('/'));

      it('has an examples directory with files in it', () => {
        expect(fs.existsSync(examplesDir)).toBe(true);
        expect(fs.readdirSync(examplesDir).length).toBeGreaterThan(0);
      });

      it('mirrors every file into e2e-fixtures byte for byte', () => {
        const files = fs
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
