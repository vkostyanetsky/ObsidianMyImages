import type { Editor, EditorPosition, EditorTransaction } from "obsidian";
import { describe, expect, it } from "vitest";

import { applyEditsToEditor } from "../src/editor/apply-edits";
import type { TextEdit } from "../src/markdown/edits";

/**
 * A minimal stand-in for the Obsidian editor, covering just the API surface
 * `applyEditsToEditor` relies on. Like the real editor, it uses `\n` internally.
 */
class StubEditor {
	value: string;
	selections: { anchor: EditorPosition; head: EditorPosition }[];
	transactions = 0;

	constructor(value: string, selections: { anchor: EditorPosition; head: EditorPosition }[]) {
		this.value = value;
		this.selections = selections;
	}

	getValue(): string {
		return this.value;
	}

	listSelections(): { anchor: EditorPosition; head: EditorPosition }[] {
		return this.selections;
	}

	offsetToPos(offset: number): EditorPosition {
		const before = this.value.slice(0, offset);
		const line = before.split("\n").length - 1;
		const lineStart = before.lastIndexOf("\n") + 1;

		return { line, ch: offset - lineStart };
	}

	posToOffset(position: EditorPosition): number {
		const lines = this.value.split("\n");
		let offset = 0;

		for (let index = 0; index < position.line; index += 1) {
			offset += lines[index].length + 1;
		}

		return offset + position.ch;
	}

	transaction(transaction: EditorTransaction): void {
		this.transactions += 1;

		const changes = [...(transaction.changes ?? [])].sort(
			(left, right) => this.posToOffset(right.from) - this.posToOffset(left.from),
		);

		for (const change of changes) {
			const from = this.posToOffset(change.from);
			const to = change.to === undefined ? from : this.posToOffset(change.to);
			this.value = this.value.slice(0, from) + change.text + this.value.slice(to);
		}

		if (transaction.selections !== undefined) {
			this.selections = transaction.selections.map((selection) => ({
				anchor: selection.from,
				head: selection.to ?? selection.from,
			}));
		}
	}

	asEditor(): Editor {
		return this as unknown as Editor;
	}
}

describe("applyEditsToEditor", () => {
	it("applies every edit of the document in a single transaction", () => {
		const editor = new StubEditor("![[1.png]]\n![[2.png]]\n![[3.png]]\n", [
			{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
		]);
		const edits: TextEdit[] = [
			{ start: 3, end: 4, text: "Note 01" },
			{ start: 14, end: 15, text: "Note 02" },
			{ start: 25, end: 26, text: "Note 03" },
		];

		const changed = applyEditsToEditor(editor.asEditor(), edits);

		expect(changed).toBe(true);
		expect(editor.transactions).toBe(1);
		expect(editor.value).toBe("![[Note 01.png]]\n![[Note 02.png]]\n![[Note 03.png]]\n");
	});

	it("does not touch the editor when nothing changes", () => {
		const editor = new StubEditor("![[Note 01.png]]\n", [
			{ anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
		]);

		const changed = applyEditsToEditor(editor.asEditor(), []);

		expect(changed).toBe(false);
		expect(editor.transactions).toBe(0);
		expect(editor.value).toBe("![[Note 01.png]]\n");
	});

	it("keeps the caret on the text that follows a widened edit", () => {
		// The caret sits on the "." of ".png"; "1" grows into "Note 01", so the
		// caret has to move six columns to the right to stay on the same character.
		const editor = new StubEditor("first line\n![[1.png]]\n", [
			{ anchor: { line: 1, ch: 4 }, head: { line: 1, ch: 4 } },
		]);

		applyEditsToEditor(editor.asEditor(), [{ start: 14, end: 15, text: "Note 01" }]);

		expect(editor.value).toBe("first line\n![[Note 01.png]]\n");
		expect(editor.selections).toEqual([
			{ anchor: { line: 1, ch: 10 }, head: { line: 1, ch: 10 } },
		]);
		expect(editor.value.split("\n")[1][10]).toBe(".");
	});

	it("keeps a selection on a line the edits did not touch", () => {
		const editor = new StubEditor("![[1.png]]\nbody text\n", [
			{ anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 4 } },
		]);

		applyEditsToEditor(editor.asEditor(), [{ start: 3, end: 4, text: "Note 01" }]);

		expect(editor.selections).toEqual([
			{ anchor: { line: 1, ch: 0 }, head: { line: 1, ch: 4 } },
		]);
	});
});
