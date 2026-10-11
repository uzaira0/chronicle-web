import { resolve } from 'node:path';
import ts from 'typescript';

// Compile the real app graph, reporting the wire fixture and its production types.
// The final full typecheck separately reports diagnostics in unrelated files.
const root = resolve(import.meta.dir, '..');
const configPath = resolve(root, 'tsconfig.app.json');
const config = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const focusedPaths = new Set([
  'src/modern/state/study-operations-api.ts',
  'src/modern/state/study-operations-api-shapes.test.ts',
  'src/modern/routes/study-compliance-page.tsx',
  'src/modern/routes/study-compliance-page.W26.test.tsx',
].map((path) => resolve(root, path)));
const focused = diagnostics.filter((diagnostic) => !diagnostic.file || focusedPaths.has(resolve(diagnostic.file.fileName)));
if (focused.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(focused, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
console.log(`W26 compliance wire fixture typechecks; ${diagnostics.length} unrelated diagnostic(s) deferred to the full typecheck.`);
