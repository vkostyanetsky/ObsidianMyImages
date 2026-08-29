import type { Editor, EditorChange, EditorRangeOrCaret } from "obsidian";

import type { TextEdit } from "../markdown/edits";
import { mapPosition } from "./position-mapping";
import type { LineChange } from "./position-mapping";

/**
 * Applies text edits to an editor as a single transaction, so that the whole
 * operation becomes a single entry in the undo history. Cursor positions and
 * selections are carried over to their new columns.
 *
 * Returns `false` when there was nothing to change.
 */
export function applyEditsToEditor(editor: Editor, edits: TextEdit[]): boolean {
	if (edits.length === 0) {
		return false;
	}

	const changes: EditorChange[] = [];
	const lineChanges: LineChange[] = [];

	for (const edit of edits) {
		const from = editor.offsetToPos(edit.start);
		const to = editor.offsetToPos(edit.end);

		changes.push({ from, to, text: edit.text });
		lineChanges.push({ line: from.line, fromCh: from.ch, toCh: to.ch, text: edit.text });
	}

	const selections: EditorRangeOrCaret[] = editor.listSelections().map((selection) => ({
		from: mapPosition(selection.anchor, lineChanges),
		to: mapPosition(selection.head, lineChanges),
	}));

	editor.transaction({ changes, selections });

	return true;
}
