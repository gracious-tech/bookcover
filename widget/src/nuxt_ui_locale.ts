
// Bridges Nuxt UI's own internal locale system (separate from vue-i18n — it's how Nuxt UI
// translates its own components' built-in strings, e.g. modal/toast close buttons, calendar
// nav) to follow our app locale, without adopting <UApp> (which would pull in
// TooltipProvider/UToaster/UOverlayProvider behavior changes unrelated to i18n)

import {computed, type App} from 'vue'
import {localeContextInjectionKey} from '@nuxt/ui/composables/useLocale'
import ui_en from '@nuxt/ui/runtime/locale/en.js'
import ui_vi from '@nuxt/ui/runtime/locale/vi.js'
import {i18n} from './i18n'

const nuxt_ui_locale = computed(() => i18n.global.locale.value === 'vie' ? ui_vi : ui_en)

/** Provide Nuxt UI's locale context so its own components' strings follow our app locale —
 *  mirrors what <UApp :locale> does internally, without the rest of its provider tree */
export function provide_nuxt_ui_locale(app:App):void {
    app.provide(localeContextInjectionKey, nuxt_ui_locale)
}
