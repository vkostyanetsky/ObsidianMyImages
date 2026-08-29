import type { TextEdit } from "../markdown/edits";
import { encodePathSegment, findImageEmbeds } from "./links";
import { fileName, joinPath, parentPath } from "./paths";
import type {
	ImageEmbed,
	RenameEntry,
	RenamePlan,
	RenamedFile,
	ResolvedEmbed,
	VaultFile,
} from "./types";

/**
 * Formats an image number with as many digits as the total has, so that ten
 * images are numbered `01`…`10` and nine images are numbered `1`…`9`.
 */
export function formatImageNumber(value: number, total: number): string {
	return String(value).padStart(String(total).length, "0");
}

/**
 * Builds the name an image gets from the name of its note and its position.
 * A note that names a single image after itself needs no numbering to tell its
 * images apart, so that image carries the name of the note alone. The extension
 * of the image is preserved, including its case.
 */
export function buildImageName(noteName: string, position: number, total: number, extension: string): string {
	const number = total === 1 ? "" : ` ${formatImageNumber(position, total)}`;

	return extension === "" ? `${noteName}${number}` : `${noteName}${number}.${extension}`;
}

/**
 * Turns the resolved embeds of a note into the list of renames to perform.
 *
 * Every image is counted once, at the position of its first appearance, and
 * stays in the folder it is in. A note left with a single image to name gives
 * it its own name, without a number. Embeds that do not resolve to a vault file are
 * counted as unresolved and take no number, and neither do images that another
 * note links to as well: those belong to no single note, so renaming them after
 * this one would only take them away from the others.
 */
export function buildRenamePlan(
	noteName: string,
	resolved: ResolvedEmbed[],
	isShared: (path: string) => boolean = () => false,
): RenamePlan {
	const files: VaultFile[] = [];
	const seen = new Set<string>();
	let unresolved = 0;
	let shared = 0;

	for (const item of resolved) {
		if (item.file === null) {
			unresolved += 1;
			continue;
		}

		if (seen.has(item.file.path)) {
			continue;
		}

		seen.add(item.file.path);

		if (isShared(item.file.path)) {
			shared += 1;
			continue;
		}

		files.push(item.file);
	}

	const entries: RenameEntry[] = files.map((file, index) => ({
		file,
		targetPath: joinPath(
			parentPath(file.path),
			buildImageName(noteName, index + 1, files.length, file.extension),
		),
	}));

	return { entries, unresolved, shared };
}

/**
 * Returns the first entry whose target path is already taken by a file outside
 * of the plan, or `null` when the plan can be carried out. Paths the plan
 * itself frees up along the way are not conflicts.
 */
export function findRenameConflict(
	entries: RenameEntry[],
	exists: (path: string) => boolean,
): RenameEntry | null {
	const owned = new Set(entries.map((entry) => entry.file.path));

	for (const entry of entries) {
		if (entry.targetPath === entry.file.path || owned.has(entry.targetPath)) {
			continue;
		}

		if (exists(entry.targetPath)) {
			return entry;
		}
	}

	return null;
}

/** The edit that rewrites the file name inside one embed, if it has to change. */
function nameEdit(embed: ImageEmbed, targetPath: string): TextEdit | null {
	const wanted = encodePathSegment(fileName(targetPath), embed.encoding);
	const current = fileName(embed.raw);

	if (current === wanted) {
		return null;
	}

	return { start: embed.pathEnd - current.length, end: embed.pathEnd, text: wanted };
}

/**
 * Computes the edits that point every embed of the note at the new name of its
 * image. Only the file name inside the link is replaced; the folder, the alias,
 * the size and the title are left exactly as they are.
 *
 * The embeds are the ones found in the note *before* the renaming, so which
 * file each link means is known exactly, even when the images swap names.
 */
export function collectLinkEdits(resolved: ResolvedEmbed[], entries: RenameEntry[]): TextEdit[] {
	const targets = new Map(entries.map((entry) => [entry.file.path, entry.targetPath]));
	const edits: TextEdit[] = [];

	for (const item of resolved) {
		if (item.file === null) {
			continue;
		}

		const target = targets.get(item.file.path);
		if (target === undefined) {
			continue;
		}

		const edit = nameEdit(item.embed, target);
		if (edit !== null) {
			edits.push(edit);
		}
	}

	return edits;
}

/**
 * Computes the edits that are still missing after Obsidian has updated the
 * internal links of the note by itself: every embed that resolves to one of the
 * renamed images but does not spell its name is corrected.
 */
export function collectRepairEdits(
	source: string,
	renamed: RenamedFile[],
	resolve: (linkPath: string) => VaultFile | null,
): TextEdit[] {
	const paths = new Set(renamed.map((file) => file.file.path));
	const edits: TextEdit[] = [];

	for (const embed of findImageEmbeds(source)) {
		const file = resolve(embed.path);
		if (file === null || !paths.has(file.path)) {
			continue;
		}

		const edit = nameEdit(embed, file.path);
		if (edit !== null) {
			edits.push(edit);
		}
	}

	return edits;
}
