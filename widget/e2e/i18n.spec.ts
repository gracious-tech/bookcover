// UI language: picked from the browser's preferences, switchable from the sidebar's menu (and
// remembered), with <html lang/dir> following it — right-to-left for Arabic. Expected strings
// come from the catalogs themselves, so a retranslation doesn't break these tests

import {test, expect} from '@playwright/test'
import type {Page} from '@playwright/test'
import {watch, open_widget} from './helpers'
import ar from '../src/locales/ar'
import de from '../src/locales/de'
import fr from '../src/locales/fr'
import zh_hant from '../src/locales/zh-Hant'
import type {Messages} from '../src/locales/en'

/** Expect the sidebar and toolbar to be showing a catalog's strings */
async function expect_ui_in(page:Page, catalog:Messages):Promise<void> {
    await expect(page.getByText(catalog.sidebar.section_background, {exact: true})).toBeVisible()
    await expect(page.getByRole('button', {name: catalog.preview.export_pdf})).toBeVisible()
    await expect(page.getByRole('button', {name: catalog.preview.mode_print, exact: true})).toBeVisible()
}

test.describe('with a German browser', () => {
    test.use({locale: 'de-DE'})

    test('shows the UI in German', async ({page}) => {
        const log = watch(page)
        await open_widget(page)
        await expect_ui_in(page, de)
        await expect(page.locator('html')).toHaveAttribute('lang', 'de')
        await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
        expect(log.errors).toEqual([])
    })
})

test.describe('with an Arabic browser', () => {
    test.use({locale: 'ar-EG'})

    test('shows the UI in Arabic, laid out right to left', async ({page}) => {
        await open_widget(page)
        await expect_ui_in(page, ar)
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
        await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
        // Logical layout: the sidebar sits on the right in RTL
        const sidebar = await page.locator('aside.sidebar-panel').boundingBox()
        const preview = await page.locator('[data-preview-state]').boundingBox()
        expect(sidebar!.x).toBeGreaterThan(preview!.x)
    })
})

test.describe('with a Taiwanese browser', () => {
    test.use({locale: 'zh-TW'})

    test('matches Traditional Chinese by script', async ({page}) => {
        await open_widget(page)
        await expect_ui_in(page, zh_hant)
        await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant')
    })
})

test.describe('with an unsupported browser language', () => {
    test.use({locale: 'sw-KE'})

    test('falls back to English', async ({page}) => {
        await open_widget(page)
        await expect(page.getByText('Background', {exact: true})).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    })
})

test('the language menu switches the UI and remembers the choice', async ({page}) => {
    await open_widget(page)
    await page.getByRole('button', {name: 'Switch language'}).click()
    await page.getByRole('menuitemcheckbox', {name: 'Français'}).click()
    await expect_ui_in(page, fr)
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

    // Stored for the next standalone visit, which beats the browser's English
    await page.reload()
    await expect_ui_in(page, fr)
})

test('switching language keeps the rendered cover', async ({page}) => {
    await open_widget(page)
    await page.getByRole('button', {name: 'Switch language'}).click()
    await page.getByRole('menuitemcheckbox', {name: 'العربية'}).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('[data-preview-state]')).toHaveAttribute('data-preview-state', 'ready')
    // And back again
    await page.getByRole('button', {name: ar.sidebar.switch_language_aria}).click()
    await page.getByRole('menuitemcheckbox', {name: 'English'}).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
})
