// The Cover Text section: editing the title lines, subtitle and author re-renders the cover, and
// the per-field style popovers feed through to it

import {test, expect} from '@playwright/test'
import {watch, open_widget, print_svg, wait_for_new_cover} from './helpers'

test('editing each text field re-renders the cover', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    let svg = await print_svg(page)

    // Title line 1 (an input), then the subtitle (a textarea), then the author
    await page.getByPlaceholder('Line 1…').fill('A Different Title')
    svg = await wait_for_new_cover(page, svg)

    await page.getByText('Subtitle', {exact: true}).locator('..').getByRole('textbox').fill('A new subtitle')
    svg = await wait_for_new_cover(page, svg)

    await page.getByText('Author/Series', {exact: true}).locator('..').getByRole('textbox')
        .fill('Someone Else')
    await wait_for_new_cover(page, svg)
    expect(log.errors).toEqual([])
})

test('a title line only appears once the line before it has text', async ({page}) => {
    await open_widget(page)
    // The demo title fills lines 1 and 2, so line 3 is offered too
    const line3 = page.getByPlaceholder('Line 3…')
    await expect(line3).toBeVisible()
    await page.getByPlaceholder('Line 2…').fill('')
    await expect(line3).toBeHidden()
    await page.getByPlaceholder('Line 1…').fill('')
    await expect(page.getByPlaceholder('Line 2…')).toBeHidden()
})

test('title lines are single-line: Enter is swallowed', async ({page}) => {
    await open_widget(page)
    const line1 = page.getByPlaceholder('Line 1…')
    await line1.fill('One')
    await line1.press('Enter')
    await line1.pressSequentially(' line')
    await expect(line1).toHaveValue('One line')
})

test('the subtitle is capped at two lines', async ({page}) => {
    await open_widget(page)
    const subtitle = page.getByText('Subtitle', {exact: true}).locator('..').getByRole('textbox')
    await subtitle.fill('')
    await subtitle.pressSequentially('one')
    await subtitle.press('Enter')
    await subtitle.pressSequentially('two')
    await subtitle.press('Enter')
    await subtitle.pressSequentially('three')
    await expect(subtitle).toHaveValue('one\ntwothree')
})

test('right-to-left title text renders and its input follows the text direction', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const svg = await print_svg(page)
    const line1 = page.getByPlaceholder('Line 1…')
    await expect(line1).toHaveAttribute('dir', 'auto')
    await line1.fill('الكتاب المقدس')
    await wait_for_new_cover(page, svg)
    // dir="auto" resolves to rtl for Arabic text
    expect(await line1.evaluate(el => getComputedStyle(el).direction)).toBe('rtl')
    expect(log.errors).toEqual([])
})

test('the title style popover changes the cover', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    await page.getByRole('button', {name: 'Line 1 style'}).click()
    const popover = page.getByRole('dialog')

    // Italic
    await popover.getByRole('checkbox', {name: 'Italic'}).click()
    svg = await wait_for_new_cover(page, svg)

    // Alignment
    await popover.getByRole('button', {name: 'Align left'}).click()
    svg = await wait_for_new_cover(page, svg)

    // Position on the cover (a USelect inside the popover)
    await popover.getByRole('combobox').click()
    await page.getByRole('option', {name: 'Bottom', exact: true}).click()
    await wait_for_new_cover(page, svg)
})
