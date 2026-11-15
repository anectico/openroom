export const csvCell = (value: unknown) => {
	let text = value === null || value === undefined ? '' : String(value);
	if (/^(?:[\t\r\n]|\s*[=+\-@])/.test(text)) text = `'${text}`;
	return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
