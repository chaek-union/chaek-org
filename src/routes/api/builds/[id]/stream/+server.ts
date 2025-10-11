import type { RequestHandler } from './$types';
import { buildEvents } from '$lib/server/build-events';
import { getLogLines } from '$lib/server/db/build-log-lines';
import { getBuildLogById } from '$lib/server/db/builds';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.auth();

	// Only allow chaek-union members
	if (!session?.user || !(session.user as any).isChaekMember) {
		return new Response('Unauthorized', { status: 401 });
	}

	const buildId = parseInt(params.id);

	// Get existing log lines and build status
	const [logLines, buildLog] = await Promise.all([
		getLogLines(buildId),
		getBuildLogById(buildId)
	]);

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			// Send existing log lines first
			for (const line of logLines) {
				const event = {
					buildId,
					lineNumber: line.line_number,
					type: line.log_type,
					data: line.content,
					timestamp: line.created_at
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			}

			// If build is already complete, close the stream
			if (buildLog && buildLog.status !== 'running') {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', buildId })}\n\n`));
				controller.close();
				return;
			}

			// Otherwise, listen for new log events
			let streamClosed = false;

			const logHandler = (event: any) => {
				// Skip if stream is already closed
				if (streamClosed) return;

				try {
					const message = `data: ${JSON.stringify(event)}\n\n`;
					controller.enqueue(encoder.encode(message));

					// Close stream when build status becomes final
					if (event.type === 'status' && (event.data === 'success' || event.data === 'failed')) {
						streamClosed = true;
						buildEvents.removeListener(`log:${buildId}`, logHandler);
						controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', buildId })}\n\n`));
						controller.close();
					}
				} catch (error) {
					// Stream already closed, cleanup
					streamClosed = true;
					buildEvents.removeListener(`log:${buildId}`, logHandler);
				}
			};

			buildEvents.addListener(`log:${buildId}`, logHandler);

			// Cleanup on close
			return () => {
				streamClosed = true;
				buildEvents.removeListener(`log:${buildId}`, logHandler);
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
