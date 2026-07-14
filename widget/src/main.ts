
// Book Cover Generator — Vue app entry point

import {createApp} from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import {wait_for_embed_init} from './embed'
import './tailwind.css'
import './styles.sss'

// When embedded in an iframe, wait for the parent's preset/config before mounting, so form
// fields it sets aren't clobbered by child-component watchers reacting to them post-mount
void wait_for_embed_init().then(() => {
    createApp(App).use(ui).mount('#app')
})
