import type { Brand } from '#lib/brand.ts';

export type AppearanceDraft = {
	brand: Brand;
	name: string;
	welcome: string;
	screen: string;
	phone: boolean;
};
