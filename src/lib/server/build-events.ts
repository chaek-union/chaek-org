import { EventEmitter } from 'events';
import { appendLogLine } from './db/build-log-lines.js';

export interface BuildLogEvent {
	buildId: number;
	lineNumber: number;
	type: 'stdout' | 'stderr' | 'status';
	data: string;
	timestamp: Date;
}

class BuildEventEmitter extends EventEmitter {
	async emitLog(buildId: number, type: 'stdout' | 'stderr', data: string) {
		// Append to database
		const logLine = await appendLogLine(buildId, type, data);

		const event: BuildLogEvent = {
			buildId,
			lineNumber: logLine.line_number,
			type,
			data,
			timestamp: logLine.created_at
		};

		// Emit event for SSE subscribers
		this.emit('log', event);
		this.emit(`log:${buildId}`, event);
	}

	async emitStatus(buildId: number, status: string) {
		// Append to database
		const logLine = await appendLogLine(buildId, 'status', status);

		const event: BuildLogEvent = {
			buildId,
			lineNumber: logLine.line_number,
			type: 'status',
			data: status,
			timestamp: logLine.created_at
		};

		// Emit event for SSE subscribers
		this.emit('log', event);
		this.emit(`log:${buildId}`, event);
	}
}

export const buildEvents = new BuildEventEmitter();
