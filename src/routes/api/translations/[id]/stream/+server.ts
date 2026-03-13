import type { RequestHandler } from './$types';
import { translationEvents } from '$lib/server/translation-events';
import { getTranslationLogLines } from '$lib/server/db/translation-logs';
import { getTranslationLogById } from '$lib/server/db/translation-logs';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();
	if (!session?.user || !(session.user as any).isChaekMember) {
		return new Response('Unauthorized', { status: 401 });
	}

	const logId = parseInt(params.id);

	const [logLines, translationLog] = await Promise.all([
		getTranslationLogLines(logId),
		getTranslationLogById(logId)
	]);

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send existing log lines first
			for (const line of logLines) {
				const event = {
					logId,
					lineNumber: line.line_number,
					type: line.log_type,
					data: line.content,
					timestamp: line.created_at
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			}

			// If already complete, close the stream
			if (translationLog && translationLog.status !== 'running') {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', logId })}\n\n`));
				controller.close();
				return;
			}

			// Otherwise, listen for new log events
			let streamClosed = false;

			const logHandler = (event: any) => {
				if (streamClosed) return;

				try {
					const message = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(message));

					if (event.type === 'status' && (event.data === 'success' || event.data === 'failed')) {
						streamClosed = true;
						translationEvents.removeListener(`log:${logId}`, logHandler);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', logId })}\n\n`));
						controller.close();
					}
				} catch {
					streamClosed = true;
					translationEvents.removeListener(`log:${logId}`, logHandler);
				}
			};

			translationEvents.addListener(`log:${logId}`, logHandler);

			return () => {
				streamClosed = true;
				translationEvents.removeListener(`log:${logId}`, logHandler);
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};
