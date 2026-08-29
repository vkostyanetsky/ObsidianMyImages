/** A zero-based editor position, structurally compatible with `EditorPosition`. */
export interface Position {
	line: number;
	ch: number;
}

/**
 * A replacement of the `[fromCh, toCh)` range of a single line. An edit never
 * spans a line break, so every change stays within one line.
 */
export interface LineChange {
	line: number;
	fromCh: number;
	toCh: number;
	text: string;
}

/**
 * Translates a position in the original document into the corresponding position
 * in the changed document. Changes must be non-overlapping and sorted by
 * ascending line and column.
 */
export function mapPosition(position: Position, changes: LineChange[]): Position {
	let delta = 0;

	for (const change of changes) {
		if (change.line !== position.line) {
			continue;
		}

		if (change.toCh <= position.ch) {
			delta += change.text.length - (change.toCh - change.fromCh);
			continue;
		}

		if (change.fromCh < position.ch) {
			// The position points inside a replaced range; clamp it to the end of
			// the replacement.
			return { line: position.line, ch: change.fromCh + delta + change.text.length };
		}

		break;
	}

	return { line: position.line, ch: position.ch + delta };
}
