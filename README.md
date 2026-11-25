# Redirect Checker (GitHub Pages + Cloudflare Worker)

A lightweight QA redirect checker. The static frontend is hosted on GitHub Pages; the Worker follows server redirects and returns the chain. No AI API or AI tokens are used.

## Files
- `index.html`, `styles.css`, `app.js`: GitHub Pages frontend
- `worker/`: Cloudflare Worker API

## 1. Deploy frontend to GitHub Pages
1. Create a GitHub repository, for example `redirect-checker`.
2. Upload `index.html`, `styles.css`, and `app.js` to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
5. Wait for the published site URL, typically `https://USERNAME.github.io/REPOSITORY/`.

## 2. Deploy backend to Cloudflare Workers
1. Create a Cloudflare account and install Node.js/npm locally.
2. Open a terminal in the `worker` folder.
3. Run:
   ```bash
   npm create cloudflare@latest -- redirect-checker-api
   ```
   If prompted, choose a Worker and JavaScript. Alternatively install Wrangler with `npm install -D wrangler`.
4. Copy this project's `worker/src/index.js` and `worker/wrangler.toml` into the Worker project, replacing generated files.
5. Edit `worker/wrangler.toml` and set `ALLOWED_ORIGIN` to your exact GitHub Pages origin. For a project site, the origin is `https://USERNAME.github.io` (do not include `/REPOSITORY/`).
6. Deploy using:
   ```bash
   npx wrangler deploy
   ```
7. Copy the deployed Worker URL.

## 3. Connect frontend and check
1. Open your GitHub Pages site.
2. Paste the Cloudflare Worker URL into **Redirect-checker backend URL**.
3. Upload an Excel or CSV file with headers `Old URL` and `New URL`.
4. Click **Check redirects**.
5. Export all results or only failed/blocked rows.

## Input format
| Old URL | New URL |
|---|---|
| https://example.com/old-page | https://example.com/new-page |

The first worksheet is used for Excel files. CSV is supported.

## Accuracy / limitations
- The Worker follows HTTP redirect response headers manually and records each hop.
- It uses GET requests. Some websites may block automated requests, require authentication, or behave differently by user-agent/cookies.
- Network errors and timeouts are marked **BLOCKED**, not confirmed redirect bugs.
- Query parameters are compared; parameter order is ignored. URL fragments are ignored because they are not sent in HTTP requests. Trailing slashes are treated as equivalent.
- The checker reports more than 3 redirect hops as a failure only if configured that way in app logic; Worker currently follows up to `MAX_HOPS` (default 10). Adjust the threshold in `app.js` / Worker if your QA standard requires a specific maximum.
- Use only against sites you are authorized to test. Avoid high concurrency; start with 1–3 requests.

## Important
GitHub Pages is static hosting and cannot run the redirect-checking backend by itself. The Cloudflare Worker is required to avoid browser CORS limitations. Keep `ALLOWED_ORIGIN` restricted to your published site.
