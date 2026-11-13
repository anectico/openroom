export type Message = { subject: string; text: string };

export const emailCopy = {
	memberInvite: (p: { inviter: string; url: string; days: number }): Message => ({
		subject: 'You are invited to OpenRoom',
		text: `${p.inviter} invited you to their OpenRoom.\n\nSet your password here (the link works once and for ${p.days} days):\n${p.url}\n\nIf you did not expect this, ignore this email.`,
	}),
	passwordReset: (p: { url: string }): Message => ({
		subject: 'Reset your OpenRoom password',
		text: `Someone asked to reset the password for this email.\n\nSet a new password here (the link works once and for 1 hour):\n${p.url}\n\nIf it was not you, ignore this email; your password stays the same.`,
	}),
	verificationCode: (p: { code: string; room: string; minutes: number }): Message => ({
		subject: `${p.code} is your code for ${p.room}`,
		text: `Your code to open ${p.room} is ${p.code}.\n\nIt works for ${p.minutes} minutes. If you did not ask for it, ignore this email.`,
	}),
	investorInvite: (p: { room: string; url: string; from: string }): Message => ({
		subject: `You are invited to ${p.room}`,
		text: `${p.from} invited you to the ${p.room} data room.\n\nOpen it here:\n${p.url}\n\nThe room records which pages you view.`,
	}),
	notice: (p: { text: string; url: string }): Message => ({
		subject: p.text.length > 90 ? `${p.text.slice(0, 87)}…` : p.text,
		text: `${p.text}.\n\nSee it in OpenRoom:\n${p.url}\n\nChoose which events email you in OpenRoom, under Notifications.`,
	}),
	questionReply: (p: { room: string; body: string; url: string | null }): Message => ({
		subject: `New answer to your question in ${p.room}`,
		text: `You have a new answer to your question in ${p.room}:\n\n${p.body}\n\n${p.url ? `Read and reply here (open the link you were sent first if your session has ended):\n${p.url}` : 'Open the link you were sent to read and reply.'}`,
	}),
	fileRequest: (p: { room: string; title: string; url: string; dueAt: number | null }): Message => ({
		subject: `File requested in ${p.room}: ${p.title}`,
		text: `The team behind ${p.room} asks you to upload: ${p.title}${p.dueAt ? ` (due ${new Date(p.dueAt).toISOString().slice(0, 10)})` : ''}.\n\nUpload it here (open the link you were sent first if your session has ended):\n${p.url}`,
	}),
	test: (p: { origin: string }): Message => ({
		subject: 'OpenRoom test email',
		text: `This is a test email from OpenRoom at ${p.origin}. Email works.`,
	}),
};
