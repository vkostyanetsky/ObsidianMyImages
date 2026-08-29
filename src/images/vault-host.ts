import type { App, Editor } from "obsidian";
import { MarkdownView, TFile, normalizePath } from "obsidian";

import { applyEditsToEditor } from "../editor/apply-edits";
import { log } from "../log";
import { applyTextEdits } from "../markdown/edits";
import { fileName, parentPath, resolveRelativePath } from "./paths";
import type { TextEdit } from "../markdown/edits";
import { TEMPORARY_PREFIX } from "./rename";
import type { ImageRenameHost } from "./rename";
import type { VaultFile } from "./types";

function snapshot(file: TFile): VaultFile {
	return { path: file.path, extension: file.extension };
}

function fileAt(app: App, path: string): TFile | null {
	const file = app.vault.getAbstractFileByPath(normalizePath(path));

	return file instanceof TFile ? file : null;
}

/**
 * Resolves the path of an embed the way Obsidian does, falling back to a path
 * relative to the note and to a vault-absolute path, which covers the Markdown
 * link syntax as well.
 */
function resolveImage(app: App, linkPath: string, notePath: string): VaultFile | null {
	const linked = app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
	if (linked instanceof TFile) {
		return snapshot(linked);
	}

	const relative = fileAt(app, resolveRelativePath(parentPath(notePath), linkPath));
	if (relative !== null) {
		return snapshot(relative);
	}

	const absolute = fileAt(app, linkPath);

	return absolute === null ? null : snapshot(absolute);
}

/**
 * The notes other than `notePath` that link to the file at `imagePath`, taken
 * from the link index Obsidian keeps. Embeds count as links there, so an image
 * a second note shows is found even when nothing links to it in writing.
 */
function notesUsing(app: App, imagePath: string, notePath: string): string[] {
	const links = app.metadataCache.resolvedLinks;
	const notes: string[] = [];

	for (const source of Object.keys(links)) {
		if (source === notePath) {
			continue;
		}

		const targets = links[source];

		if (targets !== undefined && (targets[imagePath] ?? 0) > 0) {
			notes.push(source);
		}
	}

	return notes;
}

/** How a set of link edits is announced in the log. */
function describeEdits(edits: TextEdit[]): string {
	return `${edits.length} ${edits.length === 1 ? "link" : "links"}`;
}

/** The half of the host that only ever touches the vault, shared by both hosts. */
function vaultSide(app: App, note: TFile): Omit<ImageRenameHost, "readNote" | "updateNote"> {
	return {
		noteName: note.basename,
		resolveImage: (linkPath) => resolveImage(app, linkPath, note.path),
		notesUsingImage: (path) => {
			const notes = notesUsing(app, path, note.path);

			if (notes.length > 0) {
				log(
					`leaving "${path}" alone: it is used in ${notes.length} other ` +
						`${notes.length === 1 ? "note" : "notes"} (${notes.join(", ")})`,
				);
			}

			return notes;
		},
		exists: (path) => app.vault.getAbstractFileByPath(normalizePath(path)) !== null,
		renameFile: async (from, to) => {
			const file = fileAt(app, from);

			if (file === null) {
				throw new Error(`there is no file at "${from}"`);
			}

			log(
				fileName(to).startsWith(TEMPORARY_PREFIX)
					? `moving image "${from}" aside, so that the images can trade names`
					: `renaming image "${from}" to "${to}"`,
			);

			await app.fileManager.renameFile(file, normalizePath(to));
		},
	};
}

/** Binds the renaming to a note that is open, so that it stays undoable. */
function editorHost(app: App, note: TFile, editor: Editor): ImageRenameHost {
	return {
		...vaultSide(app, note),
		readNote: () => editor.getValue(),
		updateNote: (edits) => {
			if (edits.length === 0) {
				return;
			}

			log(`writing ${describeEdits(edits)} to the open note "${note.path}"`);
			applyEditsToEditor(editor, edits);
		},
	};
}

/**
 * Binds the renaming to a note that is not open anywhere. The note is written
 * back in one atomic step, and only when it still holds what was planned
 * against, so that a change from elsewhere is never overwritten.
 */
function fileHost(app: App, note: TFile): ImageRenameHost {
	let lastRead: string | null = null;

	return {
		...vaultSide(app, note),
		readNote: async () => {
			lastRead = await app.vault.read(note);

			return lastRead;
		},
		updateNote: async (edits) => {
			if (edits.length === 0) {
				return;
			}

			const planned = lastRead;

			log(`writing ${describeEdits(edits)} to "${note.path}"`);

			await app.vault.process(note, (data) => {
				if (data !== planned) {
					throw new Error(`"${note.path}" was changed while its images were renamed`);
				}

				return applyTextEdits(data, edits);
			});
		},
	};
}

/** The editor showing the given note, or `null` when it is not open. */
function openEditor(app: App, note: TFile): Editor | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;

		if (view instanceof MarkdownView && view.file !== null && view.file.path === note.path) {
			return view.editor;
		}
	}

	return null;
}

/**
 * Binds the image renaming to any note of the vault, going through the editor
 * when the note happens to be open and through the file itself otherwise.
 */
export function createNoteRenameHost(app: App, note: TFile): ImageRenameHost {
	const editor = openEditor(app, note);

	return editor === null ? fileHost(app, note) : editorHost(app, note, editor);
}
