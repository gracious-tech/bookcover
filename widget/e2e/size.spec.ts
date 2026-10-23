// The Book Size section: printing service, trim size, page count and binding all change the
// rendered cover's physical dimensions (read off the print SVG's width/height, in pt)

import {test, expect} from '@playwright/test'
import type {Page, Locator} from '@playwright/test'
import {watch, open_widget, print_svg, wait_for_new_cover, wait_ready, svg_size, field, choose,
    preview_area} from './helpers'

// Points per millimetre, the unit conversion for reading SVG sizes as print sizes
const PT_PER_MM = 72 / 25.4

/** The trim-size group (its header row holds the label, so the group is two levels up) */
function trim_size(page:Page):Locator {
    return page.getByText('Trim size', {exact: true}).locator('../..')
}

test('more pages widen the spine, and so the spread, but not its height', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    await field(page, 'Page count').getByRole('spinbutton').fill('600')
    const after = await wait_for_new_cover(page, before)
    expect(svg_size(after).width).toBeGreaterThan(svg_size(before).width)
    expect(svg_size(after).height).toBe(svg_size(before).height)
})

test('a different trim size changes the cover size', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    // Lulu (the default) offers more than five sizes, so they're in a dropdown
    await choose(page, trim_size(page).getByRole('combobox'), 'A4')
    const after = await wait_for_new_cover(page, before)
    expect(svg_size(after).height).toBeGreaterThan(svg_size(before).height)
})

test('switching printing service resets the size to that service\'s first one', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    await choose(page, field(page, 'Printing service').getByRole('combobox'),
        'Kindle Direct Publishing')
    await expect(trim_size(page).getByRole('combobox')).toHaveText(/Novella/)
    await wait_for_new_cover(page, before)

    // A service with few sizes shows them as buttons instead, and has a single binding (a stapled
    // booklet, so the page count has to come down first or nothing can bind it)
    await field(page, 'Page count').getByRole('spinbutton').fill('40')
    await choose(page, field(page, 'Printing service').getByRole('combobox'), 'Officeworks')
    await expect(trim_size(page).getByRole('button', {name: 'A5', exact: true})).toBeVisible()
    await expect(page.getByText('Binding', {exact: true})).toBeHidden()
    await wait_ready(page)
})

test('a custom trim size renders at exactly that size plus bleed', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    await choose(page, trim_size(page).getByRole('combobox'), 'Custom…')
    svg = await wait_for_new_cover(page, svg)

    await field(page, 'Height').getByRole('spinbutton').fill('250')
    svg = await wait_for_new_cover(page, svg)
    // Lulu's bleed is 0.125in on each edge
    expect(svg_size(svg).height).toBeCloseTo((250 + 2 * 3.175) * PT_PER_MM, 0)

    await field(page, 'Width').getByRole('spinbutton').first().fill('180')
    const wider = await wait_for_new_cover(page, svg)
    expect(svg_size(wider).width - svg_size(svg).width).toBeCloseTo((180 - 152) * 2 * PT_PER_MM, 0)
})

test('the custom printing service takes bleed and spine by hand', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    await choose(page, field(page, 'Printing service').getByRole('combobox'), 'Custom…')
    svg = await wait_for_new_cover(page, svg)
    // It starts on the first common size; the bleed/spine fields work with a custom trim too
    await choose(page, trim_size(page).getByRole('combobox'), 'Custom…')
    svg = await wait_for_new_cover(page, svg)

    // No page count or binding — the spine width is entered directly instead
    await expect(page.getByText('Page count', {exact: true})).toBeHidden()
    const spine = field(page, 'Spine width').getByRole('spinbutton')
    await spine.fill('40')
    svg = await wait_for_new_cover(page, svg)
    const wide = svg_size(svg).width
    await spine.fill('10')
    svg = await wait_for_new_cover(page, svg)
    expect(wide - svg_size(svg).width).toBeCloseTo(30 * PT_PER_MM, 0)

    // The unit toggle converts the entered values rather than reinterpreting them
    const height = field(page, 'Height').getByRole('spinbutton')
    const mm = Number(await height.inputValue())
    await page.getByRole('button', {name: 'inch', exact: true}).click()
    await expect.poll(async () => Number(await height.inputValue())).toBeCloseTo(mm / 25.4, 2)
    await wait_ready(page)
    expect(svg_size(await print_svg(page)).height).toBeCloseTo(svg_size(svg).height, 0)
})

test('choosing a binding re-renders the cover', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    // Lulu has more than three bindings, so they're in a dropdown
    await choose(page, field(page, 'Binding').getByRole('combobox'), 'Hardcover Case Wrap')
    const after = await wait_for_new_cover(page, before)
    // A case wrap folds round the boards, so it's larger than the paperback all round
    expect(svg_size(after).height).toBeGreaterThan(svg_size(before).height)
})

test('a page count no binding supports shows an error instead of a cover', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    await choose(page, field(page, 'Printing service').getByRole('combobox'),
        'Kindle Direct Publishing')
    await wait_ready(page)
    await field(page, 'Page count').getByRole('spinbutton').fill('2')
    await expect(preview_area(page)).toHaveAttribute('data-preview-state', 'error')
    await expect(page.getByText('No binding type supports 2 pages')).toBeVisible()

    // A valid count brings the cover back
    await field(page, 'Page count').getByRole('spinbutton').fill('200')
    await wait_ready(page)
    expect(log.errors).toEqual([])
})

test('the help link explains why the size options matter', async ({page}) => {
    await open_widget(page)
    await page.getByRole('button', {name: 'Why must these be correct?'}).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('All size options must be accurate')).toBeVisible()
    await dialog.getByRole('button', {name: 'Got it'}).click()
    await expect(dialog).toBeHidden()
})
