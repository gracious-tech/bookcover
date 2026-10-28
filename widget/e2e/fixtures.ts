// The `test` every spec imports: Playwright's own, plus (only when measuring coverage — see
// coverage.ts) an automatic fixture recording each test page's JS coverage

import {test as base, expect} from '@playwright/test'
import {COVERAGE, coverage_report} from './coverage'

export {expect}

export const test = base.extend<{js_coverage:void}>({
    // Record from before the first navigation to the end of the test, across navigations
    js_coverage: [async ({page}, use) => {
        if (!COVERAGE)
            return use()
        await page.coverage.startJSCoverage({resetOnNavigation: false})
        await use()
        await coverage_report().add(await page.coverage.stopJSCoverage())
    }, {auto: true}],
})
