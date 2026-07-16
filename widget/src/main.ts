
// Book Cover Generator — Vue app entry point

import {createApp} from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import {wait_for_embed_init, embed_locale} from './embed'
import {i18n, resolve_initial_locale} from './i18n'
import {provide_nuxt_ui_locale} from './nuxt_ui_locale'
import './tailwind.css'
import './styles.sss'

// When embedded in an iframe, wait for the parent's preset/config before mounting, so form
// fields it sets aren't clobbered by child-component watchers reacting to them post-mount
void wait_for_embed_init().then(() => {
    // Locale must resolve before mount, same reason as the preset wait above — avoid a flash
    // of the wrong language or watchers reacting to a locale change mid-mount
    resolve_initial_locale(embed_locale.value ?? undefined)
    const app = createApp(App).use(ui).use(i18n)
    provide_nuxt_ui_locale(app)
    app.mount('#app')
})
