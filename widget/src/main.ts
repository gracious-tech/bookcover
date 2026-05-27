
// Book Cover Generator — Vue app entry point

import {createApp} from 'vue'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import './tailwind.css'
import './styles.sss'

// Mount the Vue app with Nuxt UI plugin registered
createApp(App).use(ui).mount('#app')
