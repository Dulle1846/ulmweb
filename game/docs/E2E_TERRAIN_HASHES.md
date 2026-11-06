# Browser E2E terrain golden hashes

The browser E2E uses the fixed seed `20261104` and the world options configured in `tests/browser/e2e.mjs`. It hashes the complete `heightMap`, `moistureMap`, `temperatureMap` and `explored` arrays before the rejected-import check.

The expected values are committed in:

`tests/browser/terrain-hashes.golden.json`

The E2E compares its locally calculated hashes with that file, and the same assertion runs in GitHub Actions. A CI mismatch is therefore a real local/CI terrain difference, not a skipped or sampled check.

## Updating the golden values

Only update the file after an intentional change to terrain generation or world initialization.

1. Run the browser E2E locally:

   ```sh
   cd game
   export LD_LIBRARY_PATH="$HOME/.local/playwright-libs/usr/lib/x86_64-linux-gnu:$HOME/.local/playwright-libs/lib/x86_64-linux-gnu"
   export FONTCONFIG_FILE="$HOME/.local/playwright-fonts/fonts.conf"
   npm run test:e2e
   ```

2. Find the line beginning with:

   ```text
   Terrain hash snapshot:
   ```

   It contains `kind`, `length`, `hashA` and `hashB` for all four arrays.

3. Replace only the `hashes` object in `tests/browser/terrain-hashes.golden.json` with those values. Keep the fixed seed and description.

4. Run the E2E again and confirm that the comparison passes.

5. Review the golden-file diff. It should contain exactly the four changed arrays for the intended terrain change.

6. Commit the E2E change, the golden file and the world-generator change together. GitHub Actions reruns the same comparison with its own generated state.

## When not to update

Do not update the golden file to make an unexplained mismatch pass. A mismatch means one of these changed:

- the deterministic terrain generator
- the world options or seed used by the E2E
- the array shape or dtype
- a state mutation performed before the check

Investigate the first failing E2E output and the CI log before changing the golden values. The check deliberately covers every array element, so a matching prefix or a small sample is not sufficient.
