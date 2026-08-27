
// Global init for the vendored Coloris color picker (widget/src/vendor/coloris — forked from
// mdbassit/Coloris, see that file for patch notes). Coloris binds itself to every input matching
// its `el` selector via event delegation on `document`, so a single global call here covers
// every ColorPicker/ColorSwatch instance mounted anywhere in the tree, including ones that don't
// exist yet (opened modals, etc.) — no per-component init needed

import {useI18n} from 'vue-i18n'
import Coloris from './vendor/coloris/coloris.js'
import './vendor/coloris/coloris.css'
import {current_cover_colors} from './color_palette'

/** Call once from App.vue. Configures Coloris, and snapshots the "colors currently in this
 *  cover" palette into its "Chosen"/"Auto" swatch groups each time a picker opens */
export function init_coloris():void {
    const {t} = useI18n()

    const apply_swatches = () => Coloris({swatchGroups: [
        {label: t('common.chosen'), colors: current_cover_colors.value.chosen},
        {label: t('common.auto'), colors: current_cover_colors.value.auto},
    ]})

    Coloris({
        el: '[data-coloris]',
        wrap: false, // we supply our own trigger chrome (ColorPicker.vue/ColorSwatch.vue)
        alpha: false, // cover colors are opaque hex; no alpha channel downstream
        format: 'hex',
        formatToggle: true,
        themeMode: 'auto',
    })

    apply_swatches()

    // Snapshot the palette at open time only — deliberately not a reactive watch, so the
    // swatches row can't shift under the user while they're still choosing a color from it
    document.addEventListener('click', event => {
        const target = event.target
        if (target instanceof HTMLElement && target.matches('[data-coloris]'))
            apply_swatches()
    })
}

/** True if an event target lands inside a currently-open Coloris popup. Coloris always appends
 *  its popup straight to document.body, so it's never a descendant of whatever trigger/dialog/
 *  popover opened it — any "outside interaction" detector needs this check or it'll treat every
 *  click inside the color picker as outside and dismiss its container before a pick registers */
export function is_inside_coloris_popup(target:EventTarget | null):boolean {
    return target instanceof Element && !!target.closest('.clr-picker')
}

/**
 * Nuxt UI's <UPopover> (e.g. the title/subtitle/author/spine text style popovers, via
 * FontStyleOptions.vue's ColorPicker) auto-closes on any "outside" pointerdown/focus, per Reka
 * UI's DismissableLayer. Spread this onto that UPopover's `content` prop to tell it clicks/focus
 * inside .clr-picker don't count — see is_inside_coloris_popup above.
 */
export const coloris_popover_content = {
    onInteractOutside: (event:CustomEvent<{originalEvent:Event}>) => {
        if (is_inside_coloris_popup(event.detail.originalEvent.target))
            event.preventDefault()
    },
}
