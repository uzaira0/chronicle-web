import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import tailwindPlugin from 'bun-plugin-tailwind';

// Clean stale output from previous builds
rmSync('./dist', { recursive: true, force: true });

// Use HTML entrypoint — Bun processes index.html, resolves <script src="./src/modern/main.tsx">,
// bundles everything, and injects CSS <link> tags automatically.
const result = await Bun.build({
  // React ships two builds behind `process.env.NODE_ENV`, and without this define the
  // bundler keeps the DEVELOPMENT one: bigger, slower, and — the part that actually breaks
  // things — React.StrictMode double-invokes every effect. That double-invocation burns
  // one-time resources. ParticipantAccessBootstrap exchanges the participant's single-use
  // access code twice on one page load, the second call 500s on the spent reservation, and
  // the participant is told "A new link is required" for a link that was perfectly good.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  entrypoints: ['./index.html'],
  minify: true,
  outdir: './dist',
  plugins: [tailwindPlugin],
  publicPath: '/chronicle/',
  splitting: true,
  target: 'browser',
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  throw new Error('Modern Bun build failed.');
}

// Bun.build + splitting has a bug: it only injects one chunk <script> into the HTML,
// which may be a utility chunk instead of the main entry. Patch the HTML to ensure
// the entry-point chunk is referenced.
const htmlPath = './dist/index.html';
let html = readFileSync(htmlPath, 'utf-8');
html = html.replace('</head>', '<script src="/chronicle/runtime-config.js"></script>\n</head>');

const entryOutput = result.outputs.find((o) => o.kind === 'entry-point');
if (entryOutput) {
  const entryName = basename(entryOutput.path);

  if (!html.includes(entryName)) {
    // The entry chunk is missing from HTML — inject it before </body>
    html = html.replace(
      '</body>',
      `<script type="module" crossorigin src="/chronicle/${entryName}"></script>\n</body>`,
    );
    console.log(`Patched index.html: added missing entry chunk ${entryName}`);
  }
}
writeFileSync(htmlPath, html);
