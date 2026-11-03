import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { observeAsync } from '../../apps/web/src/lib/observeAsync';

/** Synthetic React scheduling: rerendering must not resubscribe or start requests. */
export async function verifyUiAsyncBoundaries(): Promise<void> {
  const dashboardSource = ts.createSourceFile('DashboardPage.tsx', readFileSync('apps/web/src/pages/DashboardPage.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let chartMemo: string | undefined;
  function findMemo(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(dashboardSource) === 'trendChartData') chartMemo = node.initializer?.getText(dashboardSource);
    ts.forEachChild(node, findMemo);
  }
  findMemo(dashboardSource);
  assert(chartMemo);
  const evaluateMemo = new Function('useMemo', 'dashboard', 'trendData', 'trendRange', 'buildTrendChartData', 'getAppBusinessDate', `return ${chartMemo};`);
  let previousDependencies: unknown[] = [];
  let previousValue: unknown;
  const memo = (factory: () => unknown, dependencies: unknown[]) => {
    if (dependencies.length !== previousDependencies.length || dependencies.some((value, i) => !Object.is(value, previousDependencies[i]))) previousValue = factory();
    previousDependencies = dependencies;
    return previousValue;
  };
  let chartBuilds = 0;
  const points: unknown[] = [];
  const buildChart = () => { chartBuilds++; return []; };
  evaluateMemo(memo, null, points, '1y', buildChart, () => 'fixture-date');
  evaluateMemo(memo, null, points, '1m', buildChart, () => 'fixture-date');
  assert.equal(chartBuilds, 2, 'Changing the range must refresh the live endpoint clock even before history arrives');
  const maintenanceSource = ts.createSourceFile('DataMaintenancePage.tsx', readFileSync('apps/web/src/pages/DataMaintenancePage.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let tabLoader: string | undefined;
  function findLoader(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'loadActiveTab') tabLoader = node.getText(maintenanceSource);
    ts.forEachChild(node, findLoader);
  }
  findLoader(maintenanceSource);
  assert(tabLoader);
  const loaderFactory = new Function('activeTab', 'loadDataSources', 'loadFxRates', 'loadPrices', 'loadJobRuns', 'loadBackupRuns', 'setError', `${ts.transpile(tabLoader)}; return loadActiveTab;`);
  const tabRequests: string[] = [];
  const sources = async () => { tabRequests.push('sources'); };
  const fx = async (offset: number) => { tabRequests.push(`fx:${offset}`); };
  const initiatingLoader = loaderFactory('fx', sources, fx) as (offset: number) => Promise<void>;
  const currentLoader = loaderFactory('sources', sources, fx) as (offset: number) => Promise<void>;
  await initiatingLoader(20);
  await currentLoader(0);
  assert.deepEqual(tabRequests, ['fx:20', 'sources'], 'An in-flight action retains its initiating tab while the current effect uses the new tab');
  let messages = 0;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    assert.deepEqual(args, ['Unexpected asynchronous UI operation failure.']);
    messages++;
  };
  try {
    observeAsync(undefined);
    observeAsync(Promise.resolve());
    observeAsync(Promise.reject(new Error('private fixture payload')));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(messages, 1);
    let domainErrors = 0;
    observeAsync(Promise.reject(new Error('handled')).catch(() => { domainErrors++; }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(domainErrors, 1);
    assert.equal(messages, 1, 'Handled domain errors must not produce duplicate feedback');
  } finally { console.error = original; }

  const bundle = await build({ entryPoints: ['apps/web/src/lib/useEventCallback.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] });
  let reference: { current: unknown } | undefined;
  let stable: ((...args: unknown[]) => unknown) | undefined;
  let layout: (() => void) | undefined;
  const react = {
    useRef: (value: unknown) => reference ??= { current: value },
    useLayoutEffect: (callback: () => void) => { layout = callback; },
    useCallback: (callback: (...args: unknown[]) => unknown) => stable ??= callback
  };
  const module = { exports: {} as { useEventCallback: (callback: (value: number) => number) => (value: number) => number } };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, () => react);
  let calls = 0;
  const first = module.exports.useEventCallback(value => { calls++; return value + 1; });
  layout!();
  assert.equal(first(2), 3);
  const second = module.exports.useEventCallback(value => { calls++; return value + 10; });
  layout!();
  assert.equal(first, second);
  assert.equal(calls, 1, 'Rerendering must not invoke the loader');
  assert.equal(first(2), 12, 'The stable callback must use the latest committed closure');
}
