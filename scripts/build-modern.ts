import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import tailwindPlugin from 'bun-plugin-tailwind';
import { BUILD_METAFILE_PATH } from './build-artifacts';
import { collectThirdPartyNotices } from './third-party-notices';

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
  // Keep fonts out of the render-blocking CSS. Bun 1.3 inlines every CSS url() asset as a
  // data: URI (loader: file does not change that), which made fonts 70% of the stylesheet
  // (177 KB of 254 KB) and defeated font-display:swap. Left external, the url survives
  // unresolved; the block after the build copies the fonts with a content hash.
  external: ['*.woff2'],
  minify: true,
  metafile: true,
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

mkdirSync(dirname(BUILD_METAFILE_PATH), { recursive: true });
writeFileSync(BUILD_METAFILE_PATH, JSON.stringify(result.metafile));

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
writeFileSync('./dist/THIRD-PARTY-NOTICES.txt', collectThirdPartyNotices('.'));

// Fonts: copy with a content hash (the self-host Caddy serves hashed fonts as immutable) and
// point the CSS at the hashed name. The body face is preloaded so first text does not wait on CSS.
const fontDir = join(dirname(Bun.resolveSync('@eqds/tokens/tokens.css', import.meta.dir)), 'fonts');
mkdirSync('./dist/fonts', { recursive: true });
// SIL OFL 1.1 requires the license to travel with the font files.
copyFileSync(join(fontDir, 'OFL.txt'), './dist/fonts/OFL.txt');
const cssFiles = readdirSync('./dist').filter((file) => file.endsWith('.css'));
for (const font of readdirSync(fontDir).filter((file) => file.endsWith('.woff2'))) {
  const hash = createHash('sha256')
    .update(readFileSync(join(fontDir, font)))
    .digest('hex')
    .slice(0, 8);
  const hashed = font.replace(/\.woff2$/, `-${hash}.woff2`);
  copyFileSync(join(fontDir, font), join('./dist/fonts', hashed));
  if (font === 'atkinson-hyperlegible-latin-400-normal.woff2') {
    html = html.replace(
      '</head>',
      `<link rel="preload" href="/chronicle/fonts/${hashed}" as="font" type="font/woff2" crossorigin>\n</head>`,
    );
  }
  for (const css of cssFiles) {
    const path = join('./dist', css);
    // The Tailwind plugin rewrites the url relative to the source file (../node_modules/...),
    // so replace the whole url(); the CSS chunk sits in /chronicle/, next to fonts/.
    const pattern = new RegExp(`url\\([^)]*/${font.replaceAll('.', '\\.')}\\)`, 'g');
    writeFileSync(path, readFileSync(path, 'utf-8').replace(pattern, `url(fonts/${hashed})`));
  }
}

// Immutable asset names describe the final bytes, including rewritten local font URLs.
for (const css of cssFiles) {
  const path = join('./dist', css);
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
  const hashed = css.replace(/\.css$/, `-${hash}.css`);
  renameSync(path, join('./dist', hashed));
  html = html.replaceAll(css, hashed);
}
writeFileSync(htmlPath, html);
