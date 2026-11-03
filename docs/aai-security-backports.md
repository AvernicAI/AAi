# AAi dependency security backports

The 2.2.8 review updates affected transitive copies of DOMPurify, AI SDK provider-utils, xmldom, fast-uri,
glob, happy-dom, serialize-javascript, sharp, undici, Wrangler and ws. Version-scoped overrides retain
unaffected API families. Electron moves from 44.9.1 to the mature 44.10.0 maintenance release. The existing
minimum release age remains enabled.

Monaco 0.55.1 also vendors DOMPurify directly as source, outside its package dependency graph.
The committed `monaco-editor@0.55.1.patch` replaces that embedded 3.2.7 module with the published
3.4.17 ES module, preserving its license header and default export. Package overrides alone cannot
update this copy. Packaged source-map provenance and real Chromium sanitization probes verify it.

Three version-based matches remain in the raw dependency audit. They are tracked explicitly:

| Advisory | Locked dependency | Treatment |
| --- | --- | --- |
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge 4.3.1 | A committed Bun patch rejects `__proto__` during source and target copying. It covers CommonJS, UMD and source entry points. Upstream has no published fixed release. |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Zod 3.25.76 | Legacy consumers retain the Zod 3 API. A committed patch rejects oversized bounded arrays, exact-length arrays and sets before parsing their elements, including asynchronous array parsing. Direct Zod 4 consumers use 4.6.7. |
| [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) | minimatch 3.1.5 / 5.1.9 | Retained for legacy build-tool API compatibility. The advisory's `firstPhasePreProcess` amplification routine and optimization-level-2 path are absent in these copies. Newer matcher API families resolve to 11.0.3. This is a reviewed version-range match for the locked legacy implementations. |

The Zod backport follows the size-before-elements approach in the
[upstream fix](https://github.com/colinhacks/zod/commit/a0ebf970f2d752e5f58527cd2942ff48be4f46bd).
It covers the legacy v3 collection implementations used by current v3 consumers. The unused early-v4
subtree bundled inside the old v3 package is not rewritten by this backport; modern v4 imports must
continue to resolve through the current Zod 4 dependency. Upgrade legacy consumers when they support
current APIs, rather than treating the old major as an upstream-fixed release.

Run the raw audit with `bun audit --json`. It intentionally continues to report version matches for
backported packages. No advisory IDs are globally ignored. Reproduce the installed-copy patch probes
from `packages/core` with `bun test ../../script/security-patches.test.ts`; they resolve dependencies
through the actual bundler and GitLab-provider consumers. These probes must keep passing after installs
and packaging changes.

The desktop also restricts privileged RPC handoff to its own renderer, validates request origins as
origins rather than string prefixes, and reveals runnable local-file links instead of launching them.
Normal document links and explicit application/IDE launch actions retain their behavior.

Provider credentials retain the existing private SQLite credential store and integration identifiers.
POSIX database/WAL/SHM files are restricted to mode 0600 by the database owner. This change does not
introduce an incompatible credential format or claim OS-keychain encryption for the shared server store.
