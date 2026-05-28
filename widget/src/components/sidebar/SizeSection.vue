
<template lang="pug">

//- Size & Print section: service, size, page count, binding, ink, paper options

//- Service dropdown (includes "Custom..." option)
div(class="flex flex-col gap-1")
    label(class="text-xs font-semibold tracking-[0.02em]") Printing service
    USelect(v-model="form.service_id" :items="service_items")

//- Trim size: header + size selector grouped so they share gap-1 spacing
div(class="flex flex-col gap-1")
    div(class="flex items-center justify-between pb-0.5")
        span(class="text-xs font-semibold tracking-[0.02em]") Trim size
        //- Unit toggle shown only in custom service mode
        div(v-if="is_custom" class="flex gap-1")
            UButton(
                v-for="u in unit_items"
                :key="u"
                type="button"
                size="sm"
                :color="form.custom_unit === u ? 'primary' : 'neutral'"
                :variant="form.custom_unit === u ? 'solid' : 'outline'"
                @click="set_unit(u)"
            ) {{ u }}
    //- Preset size: dropdown when > 5 options, buttons otherwise
    div(v-if="size_items.length > 5" class="flex flex-col")
        USelect(
            :model-value="form.size_id || '__custom__'"
            :items="[...size_items.map(s => ({label: s.name, value: s.id, dims: s.dims})), {label: 'Custom\u2026', value: '__custom__'}]"
            @update:model-value="v => v === '__custom__' ? select_custom() : select_size(v)"
        )
            template(v-slot:item-trailing="{ item }")
                span(v-if="item_dims(item)" class="text-xs text-muted ml-4") {{ item_dims(item) }}
    div(v-else class="flex flex-wrap gap-1.25")
        UButton(
            v-for="s in size_items"
            :key="s.id"
            type="button"
            size="sm"
            :color="form.size_id === s.id ? 'primary' : 'neutral'"
            :variant="form.size_id === s.id ? 'solid' : 'outline'"
            @click="select_size(s.id)"
        ) {{ s.name }}
        UButton(
            type="button"
            size="sm"
            :color="form.size_id === '' ? 'primary' : 'neutral'"
            :variant="form.size_id === '' ? 'solid' : 'outline'"
            @click="select_custom"
        ) Custom

//- Custom dimension inputs (shown only when no size_id is selected)
div(v-show="form.size_id === ''" class="flex flex-row gap-[24px]")
    div(class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Width
        div(class="flex gap-[6px]")
            UInput(
                type="number"
                v-model.number="form.custom_trim_width"
                :min="1"
                :step="0.001"
                class="flex-1 min-w-0"
            )
            //- Unit select only shown for regular service mode (custom service uses toggle above)
            div(v-if="!is_custom" class="w-[72px] shrink-0")
                USelect(v-model="form.custom_unit" :items="unit_items")
    div(class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Height
        UInput(type="number" v-model.number="form.custom_trim_height" :min="1" :step="0.001")

//- Custom service mode: bleed and spine fields
template(v-if="is_custom")
    CustomServiceFields

//- Regular service mode: page count, binding, ink, paper
template(v-else)
    //- Page count field
    div(class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Page count
        UInput(type="number" v-model.number="form.page_count" :min="1" :step="1")

    //- Binding type (shown when more than one option exists; select when >3 items)
    div(v-if="binding_items.length > 1" class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Binding
        USelect(
            v-if="binding_items.length > 3"
            v-model="form.binding_type"
            :items="binding_items.map(b => ({...b, disabled: !b.valid}))"
            value-key="value"
            label-key="label"
        )
        div(v-else class="flex flex-wrap gap-1.25")
            UButton(
                v-for="b in binding_items"
                :key="b.value"
                type="button"
                size="sm"
                :color="form.binding_type === b.value ? 'primary' : 'neutral'"
                :variant="form.binding_type === b.value ? 'solid' : 'outline'"
                :disabled="!b.valid"
                @click="form.binding_type = b.value"
            ) {{ b.label }}

    //- Ink type (shown only when the service requires it for dimension calculation)
    div(v-if="show_ink_type && ink_items.length > 1" class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Ink type
        div(class="flex flex-wrap gap-1.25")
            UButton(
                v-for="i in ink_items"
                :key="i.value"
                type="button"
                size="sm"
                :color="form.ink_type === i.value ? 'primary' : 'neutral'"
                :variant="form.ink_type === i.value ? 'solid' : 'outline'"
                :disabled="!i.valid"
                @click="form.ink_type = i.value"
            ) {{ i.label }}

    //- Paper type (shown only when the service requires it for dimension calculation)
    div(v-if="show_paper_type && paper_items.length > 1" class="flex flex-col gap-1")
        label(class="text-xs font-semibold tracking-[0.02em]") Paper type
        div(class="flex flex-wrap gap-1.25")
            UButton(
                v-for="p in paper_items"
                :key="p.value"
                type="button"
                size="sm"
                :color="form.paper_type === p.value ? 'primary' : 'neutral'"
                :variant="form.paper_type === p.value ? 'solid' : 'outline'"
                :disabled="!p.valid"
                @click="form.paper_type = p.value"
            ) {{ p.label }}

</template>

<script setup lang="ts">
// Size & Print section — all options driven by the printing-services library

import {computed, watch, inject} from 'vue'
import {list_services, get_service, get_common_sizes} from 'printing-services'
import type {ServicePublic, BindingTypeId, SizeId, InkTypeId} from 'printing-services'
import {FORM_KEY} from '../../form_state'
import CustomServiceFields from './CustomServiceFields.vue'

// Inject the shared form state
const form = inject(FORM_KEY)!

// Unit select items for regular service custom sizes
const unit_items = ['mm', 'inch']

// Build service dropdown: real services + "Custom..." at the end
const service_items = computed(() => [
    ...list_services().map(s => ({label: s.name, value: s.id})),
    {label: 'Custom…', value: 'custom'},
])

// Whether we're in custom service mode (no printing service, manual bleed/spine)
const is_custom = computed(() => form.service_id === 'custom')

// Resolve the currently selected service (only when not in custom mode)
const service = computed(():ServicePublic | null =>
    is_custom.value ? null : get_service(form.service_id as Parameters<typeof get_service>[0]),
)

/** Extract the dims string from a USelect item object (extra property beyond label/value) */
function item_dims(item:Record<string, unknown>):string | undefined {
    return item['dims'] as string | undefined
}

/** Format trim dimensions as a short string, e.g. "6 × 9 in" or "152 × 229 mm" */
function format_dims(width:unknown, height:unknown, unit:string):string {
    const fmt = (v:unknown) => {
        const n = Number(v)
        return unit === 'mm' ? String(Math.round(n)) : (n % 1 === 0 ? String(n) : n.toFixed(2).replace(/0+$/, ''))
    }
    return `${fmt(width)} × ${fmt(height)} ${unit}`
}

// Available sizes: common sizes for custom service, service sizes otherwise
const size_items = computed(() =>
    is_custom.value
        ? get_common_sizes().map(s => ({id: s.id, name: s.name, dims: format_dims(s.width, s.height, s.unit)}))
        : service.value!.get_sizes().map(s => ({id: s.id, name: s.name, dims: format_dims(s.width, s.height, s.unit)})),
)

// All binding types with valid prop (regular service only)
const binding_items = computed(() =>
    service.value?.get_binding_types({
        all: true,
        size: (form.size_id || undefined) as SizeId | undefined,
        pages: form.page_count,
    }).map(b => ({label: b.name, value: b.id, valid: b.valid})) ?? [],
)

// All ink types with valid prop (regular service only)
const ink_items = computed(() =>
    service.value?.get_ink_types({
        all: true,
        binding_type: (form.binding_type || undefined) as BindingTypeId | undefined,
    }).map(i => ({label: i.name, value: i.id, valid: i.valid})) ?? [],
)

// All paper types with valid prop (regular service only)
const paper_items = computed(() =>
    service.value?.get_paper_types({
        all: true,
        binding_type: (form.binding_type || undefined) as BindingTypeId | undefined,
        ink_type: (form.ink_type || undefined) as InkTypeId | undefined,
    }).map(p => ({label: p.name, value: p.id, valid: p.valid})) ?? [],
)

// Whether the service needs ink/paper type for cover dimension calculations
const show_ink_type = computed(() => service.value?.cover_calc_requires_ink ?? false)
const show_paper_type = computed(() => service.value?.cover_calc_requires_paper ?? false)

/** Select a service-defined or common size preset */
function select_size(id:string):void {
    form.size_id = id
}

/** Switch to custom size mode */
function select_custom():void {
    form.size_id = ''
}

/** Convert a value between mm and inch, rounded to 3 decimal places */
function convert_unit(value:number, from:'mm' | 'inch', to:'mm' | 'inch'):number {
    if (from === to)
        return value
    const converted = from === 'mm' ? value / 25.4 : value * 25.4
    return Math.round(converted * 1000) / 1000
}

/** Toggle the unit and convert all numeric fields accordingly */
function set_unit(unit:string):void {
    const from = form.custom_unit as 'mm' | 'inch'
    const to = unit as 'mm' | 'inch'
    if (from === to)
        return
    form.custom_trim_width = convert_unit(form.custom_trim_width, from, to)
    form.custom_trim_height = convert_unit(form.custom_trim_height, from, to)
    form.custom_bleed = convert_unit(form.custom_bleed, from, to)
    form.custom_spine = convert_unit(form.custom_spine, from, to)
    form.custom_unit = unit
}

/** Reset binding to first valid option if the current one is no longer valid */
function reset_binding_if_invalid(): void {
    if (!service.value)
        return
    const valid = service.value.get_binding_types({
        size: (form.size_id || undefined) as SizeId | undefined,
        pages: form.page_count,
    })
    if (valid.length > 0 && !valid.some(b => b.id === form.binding_type)) {
        form.binding_type = valid[0]!.id
    }
}

/** Reset ink to first valid option if the current one is no longer valid */
function reset_ink_if_invalid(): void {
    if (!service.value)
        return
    const binding_type = form.binding_type as BindingTypeId
    const valid = service.value.get_ink_types({binding_type})
    if (valid.length > 0 && !valid.some(i => i.id === form.ink_type)) {
        form.ink_type = valid[0]!.id
    }
}

/** Reset paper to first valid option if the current one is no longer valid */
function reset_paper_if_invalid(): void {
    if (!service.value)
        return
    const binding_type = form.binding_type as BindingTypeId
    const ink_type = form.ink_type as InkTypeId
    const valid = service.value.get_paper_types({binding_type, ink_type})
    if (valid.length > 0 && !valid.some(p => p.id === form.paper_type)) {
        form.paper_type = valid[0]!.id
    }
}

// When the service changes, reset dependent selections to the first available option
watch(() => form.service_id, () => {
    if (is_custom.value) {
        // For custom service, default to the first common size and reset binding
        const sizes = get_common_sizes()
        form.size_id = sizes.length > 0 ? sizes[0]!.id : ''
        form.binding_type = 'paperback'
        return
    }
    const sizes = service.value!.get_sizes()
    form.size_id = sizes.length > 0 ? sizes[0]!.id : ''

    const bindings = service.value!.get_binding_types()
    form.binding_type = bindings.length > 0 ? bindings[0]!.id : ''

    const inks = service.value!.get_ink_types()
    form.ink_type = inks.length > 0 ? inks[0]!.id : ''

    const papers = service.value!.get_paper_types()
    form.paper_type = papers.length > 0 ? papers[0]!.id : ''
})

// When size changes, reset binding immediately (size is a select/button, not a text field)
watch(() => form.size_id, () => {
    reset_binding_if_invalid()
})

// When page count changes, debounce before resetting binding to avoid cascading into
// the immediate generate watcher via binding_type change
let page_count_reset_timer:ReturnType<typeof setTimeout> | null = null
watch(() => form.page_count, () => {
    if (page_count_reset_timer !== null) clearTimeout(page_count_reset_timer)
    page_count_reset_timer = setTimeout(reset_binding_if_invalid, 700)
})

// When binding changes, ink and paper may become invalid
watch(() => form.binding_type, () => {
    reset_ink_if_invalid()
    reset_paper_if_invalid()
})

// When ink changes, paper may become invalid
watch(() => form.ink_type, () => {
    reset_paper_if_invalid()
})
</script>
