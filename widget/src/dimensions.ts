
// Shared cover dimension computation — used by the preview pane and background DPI checks

import {get_service, get_custom_dimensions} from 'printing-services'
import type {BindingTypeId, SizeId, CustomSize} from 'printing-services'
import type {FormState} from './form_state'

/** Compute cover dimensions (in mm) from the current form state */
export function compute_cover_dims(form:FormState) {
    const unit = form.custom_unit as 'mm' | 'inch'
    const to_mm = (v:number) => unit === 'inch' ? v * 25.4 : v
    if (form.service_id === 'custom') {
        const size:SizeId | {width:number, height:number} = form.size_id
            ? form.size_id as SizeId
            : {width: to_mm(form.custom_trim_width), height: to_mm(form.custom_trim_height)}
        return get_custom_dimensions({
            unit: 'mm', size,
            bleed: to_mm(form.custom_bleed),
            spine: to_mm(form.custom_spine),
        })
    }
    const service = get_service(form.service_id as Parameters<typeof get_service>[0])
    const size:SizeId | CustomSize = form.size_id
        ? form.size_id as SizeId
        : {width: form.custom_trim_width, height: form.custom_trim_height, unit}
    return service.get_dimensions({
        size, pages: form.page_count,
        binding_type: form.binding_type as BindingTypeId,
        unit: 'mm',
    })
}
