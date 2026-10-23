// The back blurb's WYSIWYG editor: a lazily-loaded Tiptap modal whose edits reach the sidebar's
// preview and, once the modal closes, the cover (generation is deferred while it's open)

import {test, expect} from '@playwright/test'
import type {Page, Locator} from '@playwright/test'
import {watch, open_widget, print_svg, wait_for_new_cover, wait_ready} from './helpers'

/** Open the blurb editor and return its editable surface */
async function open_editor(page:Page):Promise<Locator> {
    await page.getByRole('button', {name: 'Edit back blurb'}).click()
    const surface = page.getByRole('dialog').locator('.ProseMirror[contenteditable="true"]')
    await expect(surface).toBeVisible()
    return surface
}

/** The sidebar's blurb preview. While the modal is open the rest of the page is aria-hidden, so
 *  this is found by attribute rather than by role */
function sidebar_preview(page:Page):Locator {
    return page.locator('[role="button"][aria-label="Edit back blurb"]')
}

/** Close the blurb editor with its own close button */
async function close_editor(page:Page):Promise<void> {
    await page.getByRole('dialog').getByRole('button', {name: 'Close'}).click()
    await expect(page.getByRole('dialog')).toBeHidden()
}

/** Click a toolbar button, then wait for the editor to take focus back. The click moves focus to
 *  the button and Tiptap only refocuses the editor on the next animation frame, so typing any
 *  sooner (a loaded machine delays that frame) lands outside the node the command just made */
async function click_tool(page:Page, surface:Locator, name:string):Promise<void> {
    await page.getByRole('dialog').getByRole('button', {name}).click()
    await expect(surface).toBeFocused()
}

/** Replace the editor's whole content with typed text */
async function retype(surface:Locator, text:string):Promise<void> {
    await surface.click()
    await surface.press('ControlOrMeta+a')
    await surface.press('Delete')
    await surface.pressSequentially(text)
}

test('typed blurb text shows in the sidebar preview and, after closing, on the cover', async ({page}) => {
    const log = watch(page)
    await open_widget(page)
    const before = await print_svg(page)
    const surface = await open_editor(page)
    await retype(surface, 'A brand new blurb for the back cover.')

    // The sidebar preview (behind the modal) follows every edit
    const preview = sidebar_preview(page)
    await expect(preview).toContainText('A brand new blurb for the back cover.')
    await expect(preview).not.toContainText('Instant book covers')

    // The cover waits for the modal to close before regenerating
    await close_editor(page)
    await wait_for_new_cover(page, before)
    expect(log.errors).toEqual([])
})

test('regeneration is deferred while the editor is open', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    const surface = await open_editor(page)
    await retype(surface, 'Deferred text')
    await expect(sidebar_preview(page)).toContainText('Deferred text')
    // Well past the text debounce, and still nothing has regenerated
    await expect(page.locator('[data-preview-state]')).toHaveAttribute('data-preview-state', 'ready')
    await page.waitForTimeout(1500)
    expect(await print_svg(page)).toBe(before)
    await close_editor(page)
    await wait_for_new_cover(page, before)
})

test('toolbar formatting becomes rich text in the sidebar preview', async ({page}) => {
    await open_widget(page)
    const surface = await open_editor(page)
    await retype(surface, 'Heading text')
    await click_tool(page, surface, 'Heading 1')
    await surface.press('End')
    await surface.press('Enter')
    await click_tool(page, surface, 'Bold')
    await surface.pressSequentially('bold words')
    await surface.press('Enter')
    await click_tool(page, surface, 'Bullet list')
    await surface.pressSequentially('a list item')

    // The editor's own DOM
    await expect(surface.locator('h1')).toHaveText('Heading text')
    await expect(surface.locator('strong')).toHaveText('bold words')
    await expect(surface.locator('ul li')).toHaveText('a list item')

    // The sidebar preview renders the same structure from the stored document
    const preview = sidebar_preview(page)
    await expect(preview.locator('h1')).toHaveText('Heading text')
    await expect(preview.locator('strong')).toHaveText('bold words')
    await expect(preview.locator('ul li')).toHaveText('a list item')
})

test('an emptied blurb leaves the back cover without one', async ({page}) => {
    await open_widget(page)
    const before = await print_svg(page)
    const surface = await open_editor(page)
    await surface.click()
    await surface.press('ControlOrMeta+a')
    await surface.press('Delete')
    await close_editor(page)
    await expect(sidebar_preview(page)).toHaveText('Click to add a back blurb…')
    const after = await wait_for_new_cover(page, before)
    // Less on the cover, so a smaller SVG
    expect(after.length).toBeLessThan(before.length)
    await wait_ready(page)
})

// An empty blurb is still a ProseMirror doc (one empty paragraph), so the placeholder must key
// off its text, not the doc
test('an emptied blurb shows the click-to-add placeholder', async ({page}) => {
    await open_widget(page)
    const surface = await open_editor(page)
    await surface.click()
    await surface.press('ControlOrMeta+a')
    await surface.press('Delete')
    await close_editor(page)
    await expect(page.getByText('Click to add a back blurb…')).toBeVisible()
})

test('the blurb style popover changes the cover', async ({page}) => {
    await open_widget(page)
    let svg = await print_svg(page)
    await page.getByRole('button', {name: 'Blurb style'}).click()
    const popover = page.getByRole('dialog')
    await popover.getByRole('button', {name: 'Align center'}).click()
    svg = await wait_for_new_cover(page, svg)
    await popover.getByRole('button', {name: 'Justify'}).click()
    await wait_for_new_cover(page, svg)
})
