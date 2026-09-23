
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {existsSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

import {make_blank_form_values, BG_PREVIEW_DIR, get_builtin_bg} from 'bookcover-web'
import type {FormState} from '../src/form_state'

// assets.ts reads window.location in dev, which the node test environment doesn't have
vi.mock('../src/assets', () => ({assets_prefix: 'https://assets.test/'}))

const {adopt_bg_image, read_render_image, fetch_bg_preview, is_builtin_bg, ALL_BACKGROUNDS} =
    await import('../src/services/backgrounds')

// The repo's committed assets tree, which the picker's filenames name
const assets_dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')

/** A complete form, overridden field by field */
function make_form(overrides:Partial<FormState> = {}):FormState {
    return {...make_blank_form_values(), ...overrides}
}

// Every fetch made by the module under test, answered with a tiny JPEG-typed body
const fetch_mock = vi.fn(async () => new Response(new Blob([new Uint8Array([1])],
    {type: 'image/jpeg'})))
vi.stubGlobal('fetch', fetch_mock)

beforeEach(() => {
    fetch_mock.mockClear()
})


describe('adopt_bg_image', () => {

    it('holds a built-in by ID alone, with no bytes', () => {
        const form = make_form({bg_image: new File([], 'upload.jpg')})
        adopt_bg_image(form, {builtin: 'beach.jpg'})
        expect(form.bg_image_builtin).toBe('beach.jpg')
        expect(form.bg_image).toBeNull()
    })

    it('holds an upload by its bytes, clearing any built-in and vector background', () => {
        const file = new File([], 'upload.jpg')
        const form = make_form({bg_image_builtin: 'beach.jpg', bg_vector_id: 'waves'})
        adopt_bg_image(form, {file})
        expect(form.bg_image).toBe(file)
        expect(form.bg_image_builtin).toBeNull()
        expect(form.bg_vector_id).toBeNull()
    })

    it('clears both when given null', () => {
        const form = make_form({bg_image_builtin: 'beach.jpg'})
        adopt_bg_image(form, null)
        expect(form.bg_image).toBeNull()
        expect(form.bg_image_builtin).toBeNull()
    })
})


describe('read_render_image', () => {

    it('returns an upload as-is for both uses, without fetching', async () => {
        const file = new File([new Uint8Array([1, 2, 3])], 'bg.jpg', {type: 'image/jpeg'})
        const form = make_form({bg_image: file})
        expect(await read_render_image(form, 'preview')).toBe(file)
        expect(await read_render_image(form, 'final')).toBe(file)
        expect(fetch_mock).not.toHaveBeenCalled()
    })

    it('returns undefined rather than null when there is no image', async () => {
        expect(await read_render_image(make_form(), 'preview')).toBeUndefined()
    })

    it('renders a built-in preview from its preview-sized copy', async () => {
        const file = await read_render_image(make_form({bg_image_builtin: 'lake.jpg'}), 'preview')
        expect(fetch_mock).toHaveBeenCalledWith(`https://assets.test/${BG_PREVIEW_DIR}lake.jpg`)
        expect(file?.name).toBe('lake.jpg')
    })

    it('renders a built-in final output from its original', async () => {
        await read_render_image(make_form({bg_image_builtin: 'lake.jpg'}), 'final')
        expect(fetch_mock).toHaveBeenCalledWith('https://assets.test/backgrounds/lake.jpg')
    })
})


describe('fetch_bg_preview', () => {

    it('fetches each preview once while it stays cached', async () => {
        const first = await fetch_bg_preview('sea.jpg')
        const second = await fetch_bg_preview('sea.jpg')
        expect(second).toBe(first)
        expect(fetch_mock).toHaveBeenCalledTimes(1)
    })

    it('drops a failed fetch so the next attempt retries', async () => {
        fetch_mock.mockResolvedValueOnce(new Response(null, {status: 404}))
        await expect(fetch_bg_preview('desert.jpg')).rejects.toThrow(/desert\.jpg/)
        await fetch_bg_preview('desert.jpg')
        expect(fetch_mock).toHaveBeenCalledTimes(2)
    })
})


describe('every background the picker can hold', () => {

    // A built-in is held by ID alone, so nothing downloads its original to fall back on — a name
    // missing from these renders without baked colors or without a preview at all
    it('has baked colors and original size (rerun .bin/gen_bg_regions if not)', () => {
        for (const name of ALL_BACKGROUNDS)
            expect(get_builtin_bg(name), name).not.toBeNull()
    })

    it('has a preview-sized copy (rerun .bin/gen_bg_thumbnails if not)', () => {
        for (const name of ALL_BACKGROUNDS)
            expect(existsSync(join(assets_dir, BG_PREVIEW_DIR, name)), name).toBe(true)
    })
})


describe('is_builtin_bg', () => {

    it('accepts shipped backgrounds and rejects anything else', () => {
        expect(is_builtin_bg('beach.jpg')).toBe(true)
        expect(is_builtin_bg('not_a_background.jpg')).toBe(false)
        expect(is_builtin_bg('constructor')).toBe(false)
    })
})
