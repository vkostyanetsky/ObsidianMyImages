/** A replacement of the `[start, end)` range of the source with `text`. */
export interface TextEdit {
	start: number;
	end: number;
	text: string;
}

/** Applies edits to a string. Edits must be sorted and non-overlapping. */
export function applyTextEdits(source: string, edits: TextEdit[]): string {
	let result = source;

	// Apply from the end so that earlier offsets stay valid.
	for (let index = edits.length - 1; index >= 0; index -= 1) {
		const edit = edits[index];
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	}

	return result;
}
