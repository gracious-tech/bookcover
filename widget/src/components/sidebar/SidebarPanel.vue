
<template lang="pug">

//- Sidebar with all form sections

aside.sidebar-panel(class="flex flex-col w-100 shrink-0 bg-(--ui-bg-elevated) border-r border-(--ui-border) overflow-hidden")
    div(class="flex-1 overflow-y-auto flex flex-col pb-50")
        div(class="text-sm font-bold tracking-[0.08em] uppercase bg-(--section-primary-header) border-b border-(--ui-border) px-4 py-[14px]") {{ t('sidebar.section_cover_text') }}
        div(class="flex flex-col gap-[24px] px-4 pb-[48px] pt-[14px] bg-(--section-primary-body)")
            ContentSection

        template(v-if="!hide_size_section")
            div(class="text-sm font-bold tracking-[0.08em] uppercase bg-(--section-middle-header) border-t border-b border-(--ui-border) px-4 py-[14px]") {{ t('sidebar.section_book_size') }}
            div(class="px-4 pb-[24px] pt-[14px] bg-(--section-middle-body)")
                div(class='flex flex-col gap-[24px]')
                    SizeSection
                div(class='text-center pt-3')
                    UButton(
                        type="button"
                        variant="link"
                        color="neutral"
                        size="xs"
                        class="self-end -mt-3"
                        @click="size_help_open = true"
                    ) {{ t('sidebar.why_must_be_correct') }}
                    SizeSectionHelpModal(v-model:open="size_help_open")

        div(class="text-sm font-bold tracking-[0.08em] uppercase bg-(--section-secondary-header) border-t border-b border-(--ui-border) px-4 py-[14px]") {{ t('sidebar.section_background') }}
        div(class="flex flex-col gap-[24px] px-4 pb-[48px] pt-[14px] bg-(--section-secondary-body)")
            BackgroundSection

        div(class="text-sm font-bold tracking-[0.08em] uppercase bg-(--ui-bg-accented) border-t border-b border-(--ui-border) px-4 py-[14px]") {{ t('sidebar.section_advanced') }}
        div(class="flex flex-col gap-[24px] px-4 pb-[48px] pt-[14px]")
            UButton(
                v-if="!show_advanced"
                variant="subtle"
                color="neutral"
                size="xs"
                class="self-center"
                @click="show_advanced = true"
            ) {{ t('sidebar.show_advanced') }}
            AdvancedSection(v-else)

        //- Language switcher — menu of all available display languages (not just a 2-way
        //- toggle, so adding a locale to i18n.ts's AVAILABLE_LOCALES needs no UI change here)
        div(class="flex justify-center px-4 pt-[14px] pb-[24px] border-t border-(--ui-border)")
            UDropdownMenu(:items="locale_menu_items")
                UButton(
                    icon="material-symbols:language"
                    :label="current_locale_name"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="cursor-pointer"
                    :aria-label="t('sidebar.switch_language_aria')"
                )

    //- Mobile-only print SVG thumbnail pinned at bottom of sidebar
    template(v-if="is_mobile")
        img.mobile-print-thumb(
            v-if="full_svg"
            :src="svg_data_url(full_svg)"
        )
        .mobile-print-loading(v-else) {{ t('sidebar.mobile_loading_preview') }}

</template>

<script setup lang="ts">

// Sidebar panel — renders all form section components

import {ref, inject, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {IS_MOBILE_KEY, FULL_SVG_KEY} from '../../form_state'
import {svg_data_url} from '../../svg_utils'
import {hide_size_section} from '../../embed'
import {AVAILABLE_LOCALES, set_locale} from '../../i18n'
import ContentSection from './ContentSection.vue'
import BackgroundSection from './BackgroundSection.vue'
import SizeSection from './SizeSection.vue'
import AdvancedSection from './AdvancedSection.vue'
import SizeSectionHelpModal from './SizeSectionHelpModal.vue'

// Injected state for mobile print thumbnail
const is_mobile = inject(IS_MOBILE_KEY)!
const full_svg = inject(FULL_SVG_KEY)!

// Whether to show the advanced options section
const show_advanced = ref(false)

// Whether the size section help modal is open
const size_help_open = ref(false)

// Explicitly register components (suppresses TS unused-import warning for Pug templates)
defineOptions({components: {ContentSection, BackgroundSection, SizeSection, AdvancedSection, SizeSectionHelpModal}})

const {t, locale} = useI18n()

// Current locale's own native display name, shown on the switcher trigger button
const current_locale_name = computed(() => AVAILABLE_LOCALES.find(l => l.code === locale.value)?.name)

// Language switcher menu items — one checkbox entry per registered locale, so adding a
// language to AVAILABLE_LOCALES automatically grows this menu with no further changes here
const locale_menu_items = computed(() => AVAILABLE_LOCALES.map(l => ({
    label: l.name,
    type: 'checkbox' as const,
    checked: locale.value === l.code,
    onSelect: () => set_locale(l.code),
})))

</script>

<style lang="sss" scoped>

/* Mobile print SVG thumbnail — pinned at bottom of sidebar */
.mobile-print-thumb, .mobile-print-loading
    display: none

@media (max-width: 1000px)
    .mobile-print-thumb, .mobile-print-loading
        width: 100%
        height: 20vh
        background: var(--ui-bg-muted)
        border-top: 1px solid var(--ui-border)
    .mobile-print-thumb
        display: block
        object-fit: contain
    .mobile-print-loading
        display: flex
        align-items: center
        justify-content: center
        color: var(--ui-text-muted)
        font-size: 0.85em

</style>
