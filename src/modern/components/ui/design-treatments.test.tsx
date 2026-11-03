import { expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import tailwindPlugin from 'bun-plugin-tailwind';
import { renderToStaticMarkup } from 'react-dom/server';
import { AcknowledgmentsCard } from '../collection-acknowledgments-card';
import { Button } from './button';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Table, TableBody, TableCell, TableRow } from './table';

function luminance(channels: number[]) {
  return channels.reduce((sum, channel, index) => {
    const value = channel / 255;
    return (
      sum +
      (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0)
    );
  }, 0);
}

function contrast(background: number[], foreground: number[]) {
  const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

test('house controls preserve treatments and animate only transform and opacity in both themes', async () => {
  const scratch = resolve('build/operator-test-runs/L01-design');
  mkdirSync(scratch, { recursive: true });
  const previousTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = scratch;
  try {
    const built = await Bun.build({
      entrypoints: ['src/modern/styles/index.css'],
      outdir: scratch,
      plugins: [tailwindPlugin],
    });
    expect(built.success).toBe(true);
    const css = await built.outputs.find((output) => output.path.endsWith('.css'))?.text();
    expect(css).toBeDefined();
    const markup = renderToStaticMarkup(
      <main className="space-y-6 bg-background p-6 text-foreground">
        <h1>Study operations</h1>
        <div className="flex gap-4">
          <Button>Register</Button>
          <Button variant="destructive">Remove participants</Button>
        </div>
        <Input aria-label="New participant ID" placeholder="CL-001…" />
        <Card>
          <CardHeader>
            <CardTitle>Collection activity</CardTitle>
          </CardHeader>
          <CardContent>Latest collection settings</CardContent>
        </Card>
        <Table aria-label="Participants">
          <TableBody>
            <TableRow>
              <TableCell>CL-001</TableCell>
              <TableCell>Enrolled</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <AcknowledgmentsCard
          entries={[
            {
              id: 'ack',
              studyId: 'study',
              acknowledgedAt: '2026-10-31T12:00:00Z',
              recordedAt: '2026-10-31T12:00:00Z',
              participantId: 'CL-001',
              acknowledgedModules: ['usage_events'],
              sourceRandomDeviceId: 'device-1',
              appVersion: '81.2',
            },
          ]}
        />
      </main>,
    );
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
      await page.route('**/*', (route) => route.abort());
      for (const theme of ['light', 'dark']) {
        await page.setContent(
          `<!doctype html><html lang="en" class="${theme === 'dark' ? 'dark' : ''}"><head><title>Study operations</title><style>${css ?? ''}</style></head><body>${markup}</body></html>`,
        );
        for (const name of ['Register', 'Remove participants']) {
          const button = page.getByRole('button', { name, exact: true });
          const colors = () =>
            button.evaluate((node) => {
              const context = document.createElement('canvas').getContext('2d');
              if (!context) throw new Error('Canvas color conversion unavailable');
              const style = getComputedStyle(node);
              context.fillStyle = getComputedStyle(node.closest('main') ?? document.body).backgroundColor;
              context.fillRect(0, 0, 1, 1);
              context.fillStyle = style.backgroundColor;
              context.fillRect(0, 0, 1, 1);
              const background = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
              context.clearRect(0, 0, 1, 1);
              context.fillStyle = style.color;
              context.fillRect(0, 0, 1, 1);
              return { background, foreground: [...context.getImageData(0, 0, 1, 1).data].slice(0, 3) };
            });
          await page.mouse.move(1090, 840);
          const rest = await colors();
          await button.hover();
          const hover = await colors();
          expect(contrast(hover.background, hover.foreground)).toBeGreaterThan(
            contrast(rest.background, rest.foreground),
          );
        }
        const transitions = await page.locator('button, input, tr').evaluateAll((nodes) =>
          nodes.map((node) => ({
            property: getComputedStyle(node).transitionProperty,
            duration: getComputedStyle(node).transitionDuration,
          })),
        );
        for (const value of transitions) {
          if (value.duration.split(',').every((duration) => Number.parseFloat(duration) === 0)) continue;
          expect(
            value.property
              .split(',')
              .map((part) => part.trim())
              .filter((part) => !['none', 'transform', 'translate', 'scale', 'rotate', 'opacity'].includes(part)),
          ).toEqual([]);
        }
        await page.mouse.move(1090, 840);
        await page.screenshot({ path: `${scratch}/${theme}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 850 });
      await page.screenshot({ path: `${scratch}/mobile-dark.png`, fullPage: true });
    } finally {
      await browser.close();
    }
  } finally {
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
  }
}, 60_000);
