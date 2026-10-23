
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {nextTick} from 'vue'
import type {CustomFont} from 'typst-fonts'
import type {FormState} from '../src/form_state'

// assets.ts reads window.location in dev, which the node test environment doesn't have
vi.mock('../src/assets', () => ({assets_prefix: 'https://assets.test/'}))

// Preview @font-face registration needs a DOM; the font store itself is what's under test
vi.mock('typst-fonts/web', () => ({register_custom_font_preview: vi.fn(async () => {})}))

// The origin the stand-in host sends from
const HOST = 'https://host.example'

// Everything the widget posted to its parent, with the target origin it named
const posted:{msg:{type:string} & Record<string, unknown>, origin:string}[] = []

// The widget's 'message' listener, captured from the stand-in window
let on_message:((event:unknown) => void) | null = null

// The stand-in parent frame, so messages can claim to come from it
const parent = {postMessage: (msg:typeof posted[0]['msg'], origin:string) => {
    posted.push({msg, origin})
}}

/** Fresh copies of the embed module and the stores it shares (all per page load), on a fresh
 *  stand-in window — embedded in an iframe unless `standalone` */
async function load(standalone = false){
    posted.length = 0
    on_message = null
    const self:Record<string, unknown> = {
        addEventListener: (type:string, fn:(event:unknown) => void) => {
            if (type === 'message') on_message = fn
        },
    }
    self['parent'] = standalone ? self : parent
    vi.stubGlobal('window', self)
    vi.resetModules()
    const embed = await import('../src/embed')
    const fonts = await import('../src/fonts')
    const backgrounds = await import('../src/services/backgrounds')
    const {make_blank_form} = await import('../src/form_state')
    return {...embed, ...fonts, ...backgrounds, make_blank_form}
}

/** Deliver a message to the widget as if posted by `source` from `origin` */
function send(data:unknown, origin = HOST, source:unknown = parent):void {
    if (!on_message)
        throw new Error('No message listener installed')
    on_message({source, origin, data})
}

/** Messages posted so far of one type */
function posted_of(type:string){
    return posted.filter(p => p.msg.type === type)
}

/** A custom font family with one file of distinct bytes */
function make_font(family:string):CustomFont {
    return {family, style: 'serif', files: [new Uint8Array([family.length])]}
}

/** Let Vue's deep form watcher run, then the widget's 500ms change debounce */
async function flush_changes():Promise<void> {
    await nextTick()
    vi.advanceTimersByTime(500)
}


beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})


describe('standalone (not in an iframe)', () => {

    it('no-ops the whole embed API', async () => {
        const {embedded, wait_for_embed_init, init_embed, make_blank_form} = await load(true)
        expect(embedded).toBe(false)
        await wait_for_embed_init()
        const form = make_blank_form()
        init_embed(form)
        form.title1 = 'Edited'
        await flush_changes()
        expect(on_message).toBeNull()
        expect(posted).toEqual([])
    })
})


describe('wait_for_embed_init', () => {

    it("announces 'ready' to any origin, then resolves on the host's init", async () => {
        const {embedded, wait_for_embed_init} = await load()
        expect(embedded).toBe(true)
        let resolved = false
        const waiting = wait_for_embed_init().then(() => { resolved = true })
        expect(posted).toEqual([{msg: {type: 'ready'}, origin: '*'}])
        await Promise.resolve()
        expect(resolved).toBe(false)
        send({type: 'init'})
        await waiting
        expect(resolved).toBe(true)
    })

    it('gives up waiting after 300ms so a silent host never blanks the widget', async () => {
        const {wait_for_embed_init, embed_seeded} = await load()
        let resolved = false
        const waiting = wait_for_embed_init().then(() => { resolved = true })
        vi.advanceTimersByTime(299)
        await Promise.resolve()
        expect(resolved).toBe(false)
        vi.advanceTimersByTime(1)
        await waiting
        expect(resolved).toBe(true)
        expect(embed_seeded.value).toBe(false)
    })

    it('applies config from init straight away', async () => {
        const {wait_for_embed_init, finished_mode, hide_size_section, embed_locale} = await load()
        const waiting = wait_for_embed_init()
        send({type: 'init', finished_mode: true, hide_size_section: true, locale: 'zh-TW'})
        await waiting
        expect(finished_mode.value).toBe(true)
        expect(hide_size_section.value).toBe(true)
        // Matched to a catalog later, by resolve_initial_locale(), so it's held verbatim here
        expect(embed_locale.value).toBe('zh-TW')
    })

    it('leaves config at its defaults when init omits it', async () => {
        const {wait_for_embed_init, finished_mode, hide_size_section, embed_locale} = await load()
        const waiting = wait_for_embed_init()
        send({type: 'init'})
        await waiting
        expect(finished_mode.value).toBe(false)
        expect(hide_size_section.value).toBe(false)
        expect(embed_locale.value).toBeNull()
    })

    it('ignores messages from anything but the parent frame, and malformed ones', async () => {
        const {wait_for_embed_init, finished_mode} = await load()
        void wait_for_embed_init()
        send({type: 'init', finished_mode: true}, HOST, {})
        send(null)
        send('init')
        send({type: 42})
        expect(finished_mode.value).toBe(false)
    })

    it('honours only the first init, and trusts only its origin afterwards', async () => {
        const {wait_for_embed_init, finished_mode, notify_cancelled} = await load()
        void wait_for_embed_init()
        send({type: 'init', finished_mode: false})
        send({type: 'init', finished_mode: true}, 'https://evil.example')
        send({type: 'init', finished_mode: true})
        expect(finished_mode.value).toBe(false)
        // Everything the widget posts from now on targets the init's origin, never '*'
        notify_cancelled()
        expect(posted.at(-1)).toEqual({msg: {type: 'cancelled'}, origin: HOST})
    })

    it('points error reports at the host origin', async () => {
        const {wait_for_embed_init} = await load()
        const {report_error} = await import('../src/error_report')
        void wait_for_embed_init()
        send({type: 'init'})
        report_error(new Error('boom'))
        expect(posted_of('error').map(p => p.origin)).toEqual([HOST])
    })

    it('marks the form seeded only for a preset or an explicit background', async () => {
        const seeded_by = async (init:Record<string, unknown>) => {
            const {wait_for_embed_init, embed_seeded} = await load()
            void wait_for_embed_init()
            send({type: 'init', ...init})
            return embed_seeded.value
        }
        expect(await seeded_by({preset: {title1: 'Hi'}})).toBe(true)
        expect(await seeded_by({bg_image: null})).toBe(true)
        expect(await seeded_by({bg_image_builtin: 'beach.jpg'})).toBe(true)
        // Offers and config don't seed anything
        expect(await seeded_by({bg_suggestions: [{id: 'a', url: 'https://h/a.jpg'}]})).toBe(false)
        expect(await seeded_by({finished_mode: true})).toBe(false)
    })

    it('keeps only well-formed background suggestions, in order', async () => {
        const {wait_for_embed_init, bg_suggestions} = await load()
        void wait_for_embed_init()
        const good = [
            {id: 'a', url: 'https://h/a.jpg', label: 'A'},
            {id: 'b', url: 'https://h/b.jpg'},
        ]
        send({type: 'init', bg_suggestions: [null, good[0], {id: 1, url: 'x'}, {id: 'c'},
            'junk', good[1]]})
        expect(bg_suggestions.value).toEqual(good)
    })

    it('treats a non-array suggestions field as the feature being off', async () => {
        const {wait_for_embed_init, bg_suggestions} = await load()
        void wait_for_embed_init()
        send({type: 'init', bg_suggestions: {id: 'a', url: 'https://h/a.jpg'}})
        expect(bg_suggestions.value).toEqual([])
    })
})


describe('init_embed — applying the preset', () => {

    it('assigns the preset over the form, leaving fields it omits alone', async () => {
        const {wait_for_embed_init, init_embed, make_blank_form} = await load()
        void wait_for_embed_init()
        send({type: 'init', preset: {title1: 'Seeded', bg_vector_id: 'boat'}})
        const form = make_blank_form()
        form.author = 'Kept'
        init_embed(form)
        expect(form.title1).toBe('Seeded')
        expect(form.author).toBe('Kept')
        // apply_preset deliberately skips adopt_bg_image, which would clear the vector
        expect(form.bg_vector_id).toBe('boat')
    })

    it('holds a known built-in by ID, dropping any bytes sent beside it', async () => {
        const {wait_for_embed_init, init_embed, make_blank_form} = await load()
        void wait_for_embed_init()
        send({type: 'init', bg_image_builtin: 'beach.jpg', bg_image: new File([], 'beach.jpg')})
        const form = make_blank_form()
        init_embed(form)
        expect(form.bg_image_builtin).toBe('beach.jpg')
        expect(form.bg_image).toBeNull()
    })

    it('warns about an unknown built-in and lets the bytes stand as an upload', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const {wait_for_embed_init, init_embed, make_blank_form} = await load()
        void wait_for_embed_init()
        const bytes = new File([new Uint8Array([1, 2])], 'mine.jpg')
        send({type: 'init', bg_image_builtin: 'no_such.jpg', bg_image: bytes})
        const form = make_blank_form()
        init_embed(form)
        expect(form.bg_image).toBe(bytes)
        expect(form.bg_image_builtin).toBeNull()
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('no_such.jpg'))
        warn.mockRestore()
    })

    it('tells an explicit null background from an absent one', async () => {
        const existing = new File([], 'existing.jpg')

        // Explicit null clears whatever the form held
        const cleared = await load()
        void cleared.wait_for_embed_init()
        send({type: 'init', bg_image: null})
        const form1 = cleared.make_blank_form()
        form1.bg_image = existing
        cleared.init_embed(form1)
        expect(form1.bg_image).toBeNull()

        // Absent leaves it be
        const kept = await load()
        void kept.wait_for_embed_init()
        send({type: 'init', preset: {title1: 'x'}})
        const form2 = kept.make_blank_form()
        form2.bg_image = existing
        kept.init_embed(form2)
        expect(form2.bg_image).toBe(existing)
    })

    it('restores the host\'s fonts into the store synchronously, skipping duplicates', async () => {
        const {wait_for_embed_init, init_embed, make_blank_form, custom_font_families} = await load()
        void wait_for_embed_init()
        const fonts = [make_font('Alpha'), make_font('Beta'), make_font('Alpha')]
        send({type: 'init', custom_fonts: fonts})
        init_embed(make_blank_form())
        expect(custom_font_families.map(f => f.family)).toEqual(['Alpha', 'Beta'])
    })
})


describe('init_embed — reporting changes', () => {

    /** An embedded widget past init, with a form attached */
    async function start(init:Record<string, unknown> = {}){
        const loaded = await load()
        void loaded.wait_for_embed_init()
        send({type: 'init', ...init})
        const form = loaded.make_blank_form()
        loaded.init_embed(form)
        posted.length = 0
        return {...loaded, form}
    }

    it('posts the JSON record with binaries beside it, debounced', async () => {
        const {form} = await start()
        const file = new File([new Uint8Array([9])], 'up.jpg')
        form.title1 = 'One'
        form.bg_image = file
        await nextTick()
        vi.advanceTimersByTime(499)
        expect(posted_of('data')).toEqual([])
        vi.advanceTimersByTime(1)
        const [sent] = posted_of('data')
        expect(sent?.origin).toBe(HOST)
        expect(sent?.msg['bg_image']).toBe(file)
        expect(sent?.msg['bg_image_builtin']).toBeNull()
        // The record itself never carries the image, as bytes or ID
        const data = sent?.msg['data'] as Record<string, unknown>
        expect(data['title1']).toBe('One')
        expect(data).not.toHaveProperty('bg_image')
        expect(data).not.toHaveProperty('bg_image_builtin')
    })

    it('sends a plain JSON-safe record, not the reactive form', async () => {
        const {form} = await start()
        form.title1 = 'Plain'
        await flush_changes()
        const data = posted_of('data')[0]?.msg['data']
        expect(data).toEqual(JSON.parse(JSON.stringify(data)))
        expect(data).not.toBe(form)
    })

    it('skips a change that lands back on what was last sent', async () => {
        const {form} = await start()
        form.title1 = 'A'
        await flush_changes()
        form.title1 = 'B'
        await nextTick()
        form.title1 = 'A'
        await flush_changes()
        expect(posted_of('data')).toHaveLength(1)
    })

    it('reports a background change alone, by ID for a built-in', async () => {
        const {form} = await start()
        form.title1 = 'x'
        await flush_changes()
        form.bg_image_builtin = 'sea.jpg'
        await flush_changes()
        const sent = posted_of('data')
        expect(sent).toHaveLength(2)
        expect(sent[1]?.msg['bg_image_builtin']).toBe('sea.jpg')
        expect(sent[1]?.msg['bg_image']).toBeNull()
    })

    it('includes font bytes only when the font store changed', async () => {
        const {form, add_custom_fonts} = await start()
        form.title1 = 'first'
        await flush_changes()
        form.title1 = 'second'
        await flush_changes()
        void add_custom_fonts([make_font('Gamma')])
        await flush_changes()
        const sent = posted_of('data').map(p => p.msg['custom_fonts'] as CustomFont[] | undefined)
        // The first send establishes the baseline, the second has nothing new, the third does
        expect(sent[0]).toEqual([])
        expect(sent[1]).toBeUndefined()
        expect(sent[2]?.map(f => f.family)).toEqual(['Gamma'])
    })

    it('notices a font upload, which never touches the form', async () => {
        const {form, add_custom_fonts} = await start()
        form.title1 = 'x'
        await flush_changes()
        void add_custom_fonts([make_font('Delta')])
        await flush_changes()
        expect(posted_of('data')).toHaveLength(2)
    })
})


describe('dirty detection and finishing', () => {

    it('counts the form dirty until a baseline exists', async () => {
        const {is_form_dirty, make_blank_form} = await load()
        expect(is_form_dirty(make_blank_form())).toBe(true)
    })

    it('is clean right after the preset and dirty after any kind of edit', async () => {
        const edits:((form:FormState, fonts:(f:CustomFont[]) => Promise<string[]>) => void)[] = [
            form => { form.title1 = 'Edited' },
            form => { form.bg_image = new File([], 'new.jpg') },
            form => { form.bg_image_builtin = 'sea.jpg' },
            (_form, fonts) => { void fonts([make_font('Epsilon')]) },
        ]
        for (const edit of edits) {
            const {wait_for_embed_init, init_embed, make_blank_form, is_form_dirty,
                add_custom_fonts} = await load()
            void wait_for_embed_init()
            send({type: 'init', preset: {title1: 'Seed'}})
            const form = make_blank_form()
            init_embed(form)
            expect(is_form_dirty(form)).toBe(false)
            edit(form, add_custom_fonts)
            expect(is_form_dirty(form)).toBe(true)
        }
    })

    it('posts the complete final state on finish, fonts and all', async () => {
        const {wait_for_embed_init, init_embed, make_blank_form, notify_finished} = await load()
        void wait_for_embed_init()
        const font = make_font('Zeta')
        send({type: 'init', custom_fonts: [font], bg_image_builtin: 'lake.jpg'})
        const form = make_blank_form()
        init_embed(form)
        form.title2 = 'Final'
        notify_finished(form)
        const [finished] = posted_of('finished')
        expect(finished?.origin).toBe(HOST)
        expect((finished?.msg['data'] as Record<string, unknown>)['title2']).toBe('Final')
        expect(finished?.msg['bg_image']).toBeNull()
        expect(finished?.msg['bg_image_builtin']).toBe('lake.jpg')
        // Raw objects, not Vue proxies, so they survive structured clone
        expect(finished?.msg['custom_fonts']).toEqual([font])
        expect((finished?.msg['custom_fonts'] as CustomFont[])[0]).toBe(font)
    })
})


describe('background suggestions', () => {

    /** An embedded widget past init, with a form attached and a vector background showing */
    async function start(){
        const loaded = await load()
        void loaded.wait_for_embed_init()
        send({type: 'init', bg_suggestions: [{id: 's1', url: 'https://h/1.jpg'},
            {id: 's2', url: 'https://h/2.jpg'}]})
        const form = loaded.make_blank_form()
        form.bg_vector_id = 'boat'
        loaded.init_embed(form)
        posted.length = 0
        return {...loaded, form}
    }

    it('asks the host for the bytes and adopts them as a user upload', async () => {
        const {form, select_bg_suggestion, pending_suggestion_id, failed_suggestion_id,
            adopted_bg_suggestion_id, bg_image_is_user_upload} = await start()
        select_bg_suggestion('s1')
        expect(posted).toEqual([{msg: {type: 'bg_suggestion_selected', id: 's1'}, origin: HOST}])
        expect(pending_suggestion_id.value).toBe('s1')
        const file = new File([new Uint8Array([7])], 'one.jpg')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: file})
        expect(pending_suggestion_id.value).toBeNull()
        expect(failed_suggestion_id.value).toBeNull()
        expect(form.bg_image).toBe(file)
        expect(form.bg_image_builtin).toBeNull()
        expect(form.bg_vector_id).toBeNull()
        expect(adopted_bg_suggestion_id.value).toBe('s1')
        expect(bg_image_is_user_upload.value).toBe(true)
    })

    it('marks the tile failed on a null answer, never clearing the background', async () => {
        const {form, select_bg_suggestion, pending_suggestion_id, failed_suggestion_id} =
            await start()
        select_bg_suggestion('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: null})
        expect(pending_suggestion_id.value).toBeNull()
        expect(failed_suggestion_id.value).toBe('s1')
        expect(form.bg_vector_id).toBe('boat')
    })

    it('times out after 15s, and ignores the answer if it arrives later', async () => {
        const {form, select_bg_suggestion, pending_suggestion_id, failed_suggestion_id} =
            await start()
        select_bg_suggestion('s1')
        vi.advanceTimersByTime(14999)
        expect(pending_suggestion_id.value).toBe('s1')
        vi.advanceTimersByTime(1)
        expect(pending_suggestion_id.value).toBeNull()
        expect(failed_suggestion_id.value).toBe('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: new File([], 'late.jpg')})
        expect(form.bg_image).toBeNull()
    })

    it('lets a second click supersede the first', async () => {
        const {form, select_bg_suggestion, pending_suggestion_id, failed_suggestion_id} =
            await start()
        select_bg_suggestion('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: null})
        select_bg_suggestion('s2')
        // A fresh pick clears the earlier failure, and the earlier answer no longer counts
        expect(failed_suggestion_id.value).toBeNull()
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: new File([], 'stale.jpg')})
        expect(form.bg_image).toBeNull()
        expect(pending_suggestion_id.value).toBe('s2')
        // The first pick's timer was cancelled, so only the second can time out
        vi.advanceTimersByTime(15000)
        expect(failed_suggestion_id.value).toBe('s2')
    })

    it('ignores answers from any origin but the init one', async () => {
        const {form, select_bg_suggestion, pending_suggestion_id} = await start()
        select_bg_suggestion('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: new File([], 'x.jpg')},
            'https://evil.example')
        expect(form.bg_image).toBeNull()
        expect(pending_suggestion_id.value).toBe('s1')
    })

    it('ignores host messages sent before init', async () => {
        const {wait_for_embed_init, select_bg_suggestion, pending_suggestion_id} = await load()
        void wait_for_embed_init()
        select_bg_suggestion('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: new File([], 'x.jpg')})
        expect(pending_suggestion_id.value).toBe('s1')
    })

    it('fails an answer that arrives with no form to put it on', async () => {
        const {wait_for_embed_init, select_bg_suggestion, failed_suggestion_id} = await load()
        void wait_for_embed_init()
        send({type: 'init'})
        select_bg_suggestion('s1')
        send({type: 'bg_suggestion_resolved', id: 's1', bg_image: new File([], 'x.jpg')})
        expect(failed_suggestion_id.value).toBe('s1')
    })
})
