declare module '@nextcloud/notify_push' {
	export function listen(
		event: string,
		handler: (type: string, body?: Record<string, unknown>) => void,
	): void
}
