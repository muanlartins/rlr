# Why this is here

`@rlrml/subtr-actor` 1.4.0 (MIT, github.com/rlrml/subtr-actor), built from its v1.4.0 tag against boxcars 0.12.1
with one fix: replays where the game clears an accepted honor duel (an `AcceptedHonorDuel` update with two empty ids)
failed to parse ("Unrecognized remote id of 34"). The fix is upstream as nickbabcock/boxcars#305. The JS and types are
byte-identical to the npm 1.4.0 package; only the wasm differs.

Go back to the npm package (`"@rlrml/subtr-actor": "<version>"` in package.json) once a release carries the fix.
