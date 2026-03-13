import { EventEmitter } from 'events';
import { appendTranslationLogLine } from './db/translation-logs.js';

export interface TranslationLogEvent {
	logId: number;
	lineNumber: number;
	type: 'stdout' | 'stderr' | 'status';
	data: string;
	timestamp: Date;
}

class TranslationEventEmitter extends EventEmitter {
	async emitLog(logId: number, type: 'stdout' | 'stderr', data: string) {
		const logLine = await appendTranslationLogLine(logId, type, data);

		const event: TranslationLogEvent = {
			logId,
			lineNumber: logLine.line_number,
			type,
			data,
			timestamp: logLine.created_at
		};

		this.emit('log', event);
		this.emit(`log:${logId}`, event);
	}

	async emitStatus(logId: number, status: string) {
		const logLine = await appendTranslationLogLine(logId, 'status', status);

		const event: TranslationLogEvent = {
			logId,
			lineNumber: logLine.line_number,
			type: 'status',
			data: status,
			timestamp: logLine.created_at
		};

		this.emit('log', event);
		this.emit(`log:${logId}`, event);
	}
}

export const translationEvents = new TranslationEventEmitter();
