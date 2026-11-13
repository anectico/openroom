export type Brand = { logoUrl: string | null; accentColor: string | null; whiteLabel: boolean };
export type Branding = Brand & {
	roomOverrides: { logo: boolean; accentColor: boolean } | null;
	workspace: Brand;
};

export const defaultAccent = '#286344';

export function normalizeColor(value: string) {
	const hex = value.trim().replace(/^#/, '');
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${[...hex]
			.map((c) => c + c)
			.join('')
			.toLowerCase()}`;
	return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}

function luminance(rgb: number[]) {
	return rgb.reduce((sum, c, i) => {
		const v = c / 255;
		return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
	}, 0);
}

export function brandColors(color: string | null) {
	const accent = normalizeColor(color ?? '') ?? defaultAccent;
	const rgb = [1, 3, 5].map((i) => Number.parseInt(accent.slice(i, i + 2), 16));
	const light = luminance(rgb);
	const foreground = (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? '#000000' : '#ffffff';
	let ink = rgb;
	while (luminance(ink) > 0.13) ink = ink.map((c) => Math.floor(c * 0.9));
	return { accent, foreground, ink: `#${ink.map((c) => c.toString(16).padStart(2, '0')).join('')}` };
}

export function brandStyle(color: string | null) {
	const { accent, foreground, ink } = brandColors(color);
	return `--primary: ${accent}; --primary-foreground: ${foreground}; --ring: ${ink}; --brand-ink: ${ink}`;
}

export function brandIcon(logoUrl: string | null) {
	return logoUrl ? `${logoUrl}?icon=1` : null;
}
