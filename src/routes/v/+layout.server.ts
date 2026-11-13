import { brandingFor } from '#lib/server/branding.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ installBranding: brandingFor(null) });
