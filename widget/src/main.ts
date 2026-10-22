
// Book Cover Generator — Vue app entry point

import {createApp} from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import {wait_for_embed_init, embed_locale, embedded} from './embed'
import {install_error_reports, install_vue_error_reports} from './error_report'
import {i18n, resolve_initial_locale} from './i18n'
import './tailwind.css'
import './styles.sss'

// Catch uncaught errors from the start, so ones raised before the host's 'init' are held for it
install_error_reports()

// When embedded in an iframe, wait for the parent's preset/config before mounting, so form
// fields it sets aren't clobbered by child-component watchers reacting to them post-mount
void wait_for_embed_init().then(async () => {
    // Locale must resolve (and its catalog load) before mount, same reason as the preset wait
    // above — avoid a flash of the wrong language or watchers reacting to a locale change
    await resolve_initial_locale(embed_locale.value ?? undefined)
    const app = createApp(App).use(ui).use(i18n)
    // Vue's handler only matters to a host — standalone keeps Vue's own, with its dev traces
    if (embedded)
        install_vue_error_reports(app)
    app.mount('#app')
})
