// Dedicated conifer visual reference.
//
// The shared browser renderer is exercised with a northern, heavily forested
// fixed realm. It captures all twelve conifer formations and follows a larch
// stand through the four seasons, including its bare winter skeleton.
//
// Usage: npm run test:conifer-reference
// Output: docs/terrain-reference/conifer-reference.png
//         docs/terrain-reference/conifer-seasons.png
//         docs/terrain-reference/conifer-reference.json

process.env.FOREST_REFERENCE_PROFILE = "conifer";
await import("./forest-reference.mjs");
