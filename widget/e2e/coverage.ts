// Code coverage of the widget's own source by the browser tests — off unless E2E_COVERAGE is set,
// which .bin/coverage does. Each test's page records Chromium's built-in JS coverage (see
// fixtures.ts), monocart maps it back through the build's inline sourcemaps to src/, and this
// module's default export (the config's globalTeardown) writes the report once every worker is
// done. Only the main thread is measured: Chromium's page coverage can't see into the generator
// worker, whose code is covered by generator-web's unit tests instead

import {fileURLToPath} from 'node:url'
import {CoverageReport} from 'monocart-coverage-reports'
import type {CoverageReportOptions} from 'monocart-coverage-reports'

// Whether this run measures coverage
export const COVERAGE = !!process.env['E2E_COVERAGE']

// Where .bin/coverage builds the source-mapped widget, and where the report goes
export const COVERAGE_BUILD_DIR = fileURLToPath(new URL('../../coverage/widget_build', import.meta.url))
const REPORT_DIR = fileURLToPath(new URL('../../coverage/e2e', import.meta.url))
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

// The widget's own modules, minus the vendored Coloris and the translation catalogs (data)
const own_source = (path:string) => !path.includes('/vendor/') && !path.includes('/locales/')

/** A sourcemap path relative to the widget package — the build sits outside it, so the maps say
 *  ../../../widget/src/App.vue, while a dependency's path runs through node_modules/ or a
 *  workspace sibling's dist/ instead */
const widget_path = (path:string) => path.replace(/^(?:\.\.\/)*widget\//, '')

const options:CoverageReportOptions = {
    name: 'Widget browser tests',
    outputDir: REPORT_DIR,
    reports: ['v8', 'json-summary', 'console-summary'],
    // Scripts the built app serves, not the host pages embed.spec.ts fakes
    entryFilter: entry => new URL(entry.url).pathname.startsWith('/assets/'),
    sourceFilter: path => widget_path(path).startsWith('src/') && own_source(path),
    // Report as src/…, matching the files listed by `all` below
    sourcePath: path => widget_path(path),
    // Files no test loads at all still count, at 0%
    all: {dir: SRC_DIR, filter: path => /\.(ts|vue)$/.test(path) && !path.endsWith('.d.ts')
        && own_source(path)},
}

/** The shared report every test worker adds its pages' coverage to */
export function coverage_report():CoverageReport {
    return new CoverageReport(options)
}

/** Chromium flags, merging any features a spec disables with the ones coverage needs. Coverage
 *  turns off site isolation so a cross-origin iframe (the embedded widget in embed.spec.ts) runs
 *  in the page's own process, where its coverage is recorded. Chromium honours only one
 *  --disable-features flag, hence the merge */
export function chromium_args(disabled_features:string[] = []):string[] {
    const features = COVERAGE ? [...disabled_features, 'IsolateOrigins', 'site-per-process']
        : disabled_features
    return [
        ...(features.length ? [`--disable-features=${features.join(',')}`] : []),
        ...(COVERAGE ? ['--disable-site-isolation-trials'] : []),
    ]
}

/** globalTeardown: write the report from everything the workers added */
export default async function generate_report():Promise<void> {
    if (COVERAGE)
        await coverage_report().generate()
}
