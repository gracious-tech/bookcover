
import {describe, it, expect, afterEach} from 'vitest'

import {i18n} from '../src/i18n'
import {print_option_label, size_label, unit_label, font_group_label} from '../src/option_labels'
import de from '../src/locales/de'

// German stands in for any translated catalog
i18n.global.setLocaleMessage('de', de)

afterEach(() => { i18n.global.locale.value = 'en' })


describe('option labels', () => {

    it('translates names the catalog has', () => {
        i18n.global.locale.value = 'de'
        expect(print_option_label('lulu', 'binding', 'paperback', 'fallback'))
            .toBe(de.print_options.lulu.binding.paperback)
        expect(size_label('us_trade', 'fallback')).toBe(de.print_sizes.us_trade)
        expect(unit_label('inch')).toBe(de.units.inch)
        expect(font_group_label('Styles')).toBe(de.font_groups.styles)
    })

    it('shows the English catalog name in English', () => {
        expect(print_option_label('lulu', 'binding', 'paperback', 'fallback'))
            .toBe('Paperback Perfect Bound')
        expect(size_label('us_trade', 'fallback')).toBe('US Trade')
    })

    it("falls back to the source's own name for anything the catalog lacks", () => {
        i18n.global.locale.value = 'de'
        // An option added upstream before its catalog entry exists
        expect(print_option_label('lulu', 'binding', 'brand_new', 'Brand New Binding'))
            .toBe('Brand New Binding')
        // Keyed per service, so another service's id doesn't borrow lulu's name
        expect(print_option_label('no_such_service', 'binding', 'paperback', 'Theirs'))
            .toBe('Theirs')
        // Sizes named only by their dimensions have no entry
        expect(size_label('custom_5x8', '5" x 8"')).toBe('5" x 8"')
        expect(unit_label('cm')).toBe('cm')
        expect(font_group_label('Some new group')).toBe('Some new group')
    })
})
