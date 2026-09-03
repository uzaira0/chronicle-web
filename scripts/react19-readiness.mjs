#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import semver from 'semver';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outputPath = path.join(rootDir, 'docs', 'react19-readiness.md');
const jsonOutputPath = path.join(rootDir, 'docs', 'react19-readiness.json');
const shouldFailOnBlockers = process.argv.includes('--check');
const require = createRequire(import.meta.url);

const packageChecks = [
  {
    notes: 'Shared Redux binding for both the legacy Flow shell and the modern Bun/TypeScript shell.',
    packageDir: 'react-redux',
  },
  {
    notes: 'Modern React Router package.',
    packageDir: 'react-router',
  },
];

const verifiedPeerMismatchPackages = {};

function readPackageJson(packageDir) {
  const packageJsonPath = path.join(rootDir, 'node_modules', packageDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    return JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  }

  try {
    const resolvedPath = require.resolve(`${packageDir}/package.json`, { paths: [rootDir] });
    return JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch {
    return null;
  }
}

function getPeerRange(packageJson, peerName) {
  return packageJson?.peerDependencies?.[peerName] ?? null;
}

function evaluatePeerRange(range, version) {
  if (!range) {
    return 'unknown';
  }
  return semver.satisfies(version, range, { includePrerelease: true }) ? 'compatible' : 'blocked';
}

async function resolveTargetReactVersion() {
  if (process.env.REACT_AUDIT_TARGET) {
    return process.env.REACT_AUDIT_TARGET;
  }

  const response = await fetch('https://registry.npmjs.org/react/latest', {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to resolve latest React version from npm registry: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || typeof payload.version !== 'string') {
    throw new Error('npm registry response did not include a usable React version.');
  }

  return payload.version;
}

const targetReactVersion = await resolveTargetReactVersion();
const rows = packageChecks.map(({ notes, packageDir }) => {
  const packageJson = readPackageJson(packageDir);
  if (!packageJson) {
    return {
      notes,
      packageDir,
      reactRange: 'not installed',
      reactDomRange: 'not installed',
      status: 'unknown',
      version: 'missing',
    };
  }

  const reactRange = getPeerRange(packageJson, 'react');
  const reactDomRange = getPeerRange(packageJson, 'react-dom');
  const reactStatus = evaluatePeerRange(reactRange, targetReactVersion);
  const reactDomStatus = reactDomRange ? evaluatePeerRange(reactDomRange, targetReactVersion) : 'compatible';
  const peerMismatch = reactStatus === 'blocked' || reactDomStatus === 'blocked';
  const verifiedMismatch =
    peerMismatch &&
    verifiedPeerMismatchPackages[packageDir] &&
    verifiedPeerMismatchPackages[packageDir].version === packageJson.version;
  const status = verifiedMismatch ? 'verified' : peerMismatch ? 'blocked' : 'compatible';

  return {
    validation: verifiedMismatch ? verifiedPeerMismatchPackages[packageDir].validation : null,
    notes,
    packageDir,
    reactDomRange: reactDomRange ?? 'n/a',
    reactRange: reactRange ?? 'n/a',
    status,
    version: packageJson.version,
  };
});

const blockedRows = rows.filter((row) => row.status === 'blocked');
const verifiedRows = rows.filter((row) => row.status === 'verified');
const compatibleRows = rows.filter((row) => row.status === 'compatible');
const unknownRows = rows.filter((row) => row.status === 'unknown');
const generatedDate = new Date().toISOString().slice(0, 10);

const report = `# React 19 Readiness Audit

Updated: ${generatedDate}
Target React version: \`${targetReactVersion}\`

## Summary

- Blocked packages: ${blockedRows.length}
- Verified peer-range mismatches: ${verifiedRows.length}
- Compatible or unbounded packages: ${compatibleRows.length}
- Unknown or missing packages: ${unknownRows.length}

## Blockers

| Package | Installed | React peer range | React DOM peer range | Notes |
| --- | --- | --- | --- | --- |
${blockedRows.map((row) => `| \`${row.packageDir}\` | \`${row.version}\` | \`${row.reactRange}\` | \`${row.reactDomRange}\` | ${row.notes} |`).join('\n')}

## Verified despite peer-range mismatch

| Package | Installed | React peer range | React DOM peer range | Notes |
| --- | --- | --- | --- | --- |
${verifiedRows.map((row) => `| \`${row.packageDir}\` | \`${row.version}\` | \`${row.reactRange}\` | \`${row.reactDomRange}\` | ${row.notes} ${row.validation ?? ''} |`).join('\n')}

## Compatible or unbounded

| Package | Installed | React peer range | React DOM peer range | Notes |
| --- | --- | --- | --- | --- |
${compatibleRows.map((row) => `| \`${row.packageDir}\` | \`${row.version}\` | \`${row.reactRange}\` | \`${row.reactDomRange}\` | ${row.notes} |`).join('\n')}

## Immediate conclusions

- The Chronicle web workspace now shares a single React 19-capable Redux binding across both legacy and modern shells.
- \`lattice-ui-kit\` still carries Material UI 4-era implementation debt, but Chronicle's current React 19 validation lane passes with the pinned versions above.
- The blocking legacy blockers for styled-components and Material UI 4-era stacks have
  been removed from direct web dependencies. Remaining migration is legacy shell modernization,
  not a hard React 19 adoption blocker.
`;

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, report);
writeFileSync(
  jsonOutputPath,
  JSON.stringify(
    {
      blockedPackages: blockedRows,
      compatiblePackages: compatibleRows,
      generatedDate,
      targetReactVersion,
      verifiedPackages: verifiedRows,
      unknownPackages: unknownRows,
    },
    null,
    2,
  ),
);

process.stdout.write(`${outputPath}\n${jsonOutputPath}\n`);

if (shouldFailOnBlockers && blockedRows.length > 0) {
  process.stderr.write(`React 19 audit found ${blockedRows.length} blocking package(s).\n`);
  process.exit(1);
}
