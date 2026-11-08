# AlphaAi — by AAi

The static product site for [aai.avernic.com](https://aai.avernic.com) showcases the desktop IDE, agent, browser, model presets, library, integrations, and 3D workflows. The workspace tour is illustrative. Open its PNG tab to see the same project in the packaged desktop. The model field guide shows examples from the installed Free LLM APIs catalog.

## Upload to existing hosting

Upload **the contents of `dist/`** to the document root for `aai.avernic.com`. Keep `assets/` and `downloads/` intact. The distribution includes the Windows x64 preview installer. Check its size in `release.json` against the host's file limit. If you serve downloads separately, update both download links in `public/index.html` before rebuilding. Serve the site over HTTPS and make `index.html` the directory index. The site is static.

After uploading, open the home page and start the Windows download. Compare the installer against `downloads/SHA256SUMS.txt`. Metadata, canonical URL, and sitemap already point to the intended domain. The local build does not modify hosting or DNS.

## Edit and build

Edit `public/index.html` for the page and integration descriptions, `public/styles.css` for the theme and layout, and `public/app.js` for the workspace tour, model guide, and capability catalog. Run `node sites/aai-showcase/build.mjs` from the repo root. The script reads `release.json`, validates `artifacts/AAi-<version>-Setup-x64.exe`, then assembles `dist/`. Pass an installer path as the first argument to use a different location. Update `release.json` with the new version, exact byte count, and SHA-256 when shipping another build.

To preview the exact files locally, run `python -m http.server 8765 --bind 127.0.0.1 --directory sites/aai-showcase/dist` from the repo root and open `http://127.0.0.1:8765`.
