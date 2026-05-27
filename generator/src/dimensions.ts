
// Resolve cover dimensions from a parsed schema using printing-services

import {get_service, get_custom_dimensions} from 'printing-services'
import type {GetDimensionsArgs, GetDimensionsResult, SizeId,
    BindingTypeId, PaperTypeId, InkTypeId} from 'printing-services'
import type {CoverSchema} from './schema.js'

export type {GetDimensionsResult}

// Convert a value to mm based on its unit
function to_mm(v:number, unit:'mm' | 'inch'):number {
    return unit === 'inch' ? v * 25.4 : v
}

/**
 * Compute cover dimensions from a parsed schema. Uses the printing-services library
 * to resolve dimensions from a service, or builds custom dimensions directly.
 */
export function resolve_dimensions(schema:CoverSchema):GetDimensionsResult {
    if (schema.service_id === 'custom') {
        const unit = (schema.custom_unit ?? 'mm') as 'mm' | 'inch'
        const custom_size:SizeId | {width:number, height:number} = schema.size_id
            ? schema.size_id as SizeId
            : {width: to_mm(schema.custom_trim_width!, unit), height: to_mm(schema.custom_trim_height!, unit)}
        return get_custom_dimensions({
            unit: 'mm',
            size: custom_size,
            bleed: to_mm(schema.custom_bleed ?? 0, unit),
            spine: to_mm(schema.custom_spine ?? 0, unit),
        })
    }

    const service = get_service(schema.service_id as Parameters<typeof get_service>[0])
    const dims_args:GetDimensionsArgs = {
        size: schema.size_id ? schema.size_id as SizeId
            : {unit: schema.custom_unit as 'inch' | 'mm', width: schema.custom_trim_width!, height: schema.custom_trim_height!},
        pages: schema.page_count!,
        binding_type: schema.binding_type as BindingTypeId,
        unit: 'mm',
    }
    if (service.cover_calc_requires_paper && schema.paper_type) {
        dims_args.paper_type = schema.paper_type as PaperTypeId
    }
    if (service.cover_calc_requires_ink && schema.ink_type) {
        dims_args.ink_type = schema.ink_type as InkTypeId
    }
    return service.get_dimensions(dims_args)
}
