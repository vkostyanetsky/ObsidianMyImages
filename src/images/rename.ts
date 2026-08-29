import type { TextEdit } from "../markdown/edits";
import { findImageEmbeds } from "./links";
import {
	buildRenamePlan,
	collectLinkEdits,
	collectRepairEdits,
	findRenameConflict,
} from "./plan";
import { fileExtension, fileName, joinPath, parentPath } from "./paths";
import type { RenameEntry, RenamedFile, ResolvedEmbed, VaultFile } from "./types";

/** Prefix of the names images carry while they are being shuffled around. */
export const TEMPORARY_PREFIX = "renaming-image";

/** How many names are tried before a temporary name is given up on. */
const TEMPORARY_ATTEMPTS = 10_000;

/**
 * Everything the renaming needs from its surroundings. Keeping it behind an
 * interface leaves the logic free of the Obsidian API.
 */
export interface ImageRenameHost {
	/** Name of the note, without its `.md` extension. */
	readonly noteName: string;
	/** Current content of the note. */
	readNote(): string | Promise<string>;
	/** Resolves a link path against the note, or `null` for a broken link. */
	resolveImage(linkPath: string): VaultFile | null;
	/**
	 * The other notes that link to the file at the given path, this note left
	 * out. An image that is not this note's alone is not renamed after it.
	 */
	notesUsingImage(path: string): string[];
	/** Whether anything at all sits at the given vault path. */
	exists(path: string): boolean;
	/** Renames the file currently at `from` to `to`. */
	renameFile(from: string, to: string): Promise<void>;
	/** Rewrites the note, as one undoable step. */
	updateNote(edits: TextEdit[]): void | Promise<void>;
}

/** A rename that has been carried out and can still be taken back. */
export interface RenameOperation {
	/** Name the file had before the operation started. */
	originalPath: string;
	/** Name the file carries right now. */
	currentPath: string;
}

/** What became of a run of the command, ready to be turned into a notice. */
export type ImageRenameOutcome =
	| { kind: "no-note" }
	| { kind: "no-images" }
	| { kind: "conflict"; path: string; from: string }
	| { kind: "failed"; message: string }
	| { kind: "renamed"; renamed: number; skipped: number; shared: number };

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Finds a free name in the folder of `path`, keeping the extension. */
function temporaryPath(host: ImageRenameHost, path: string, seed: number): string {
	const folder = parentPath(path);
	const extension = fileExtension(path);

	for (let counter = seed; counter < seed + TEMPORARY_ATTEMPTS; counter += 1) {
		const name =
			extension === ""
				? `${TEMPORARY_PREFIX}-${counter}`
				: `${TEMPORARY_PREFIX}-${counter}.${extension}`;
		const candidate = joinPath(folder, name);

		if (!host.exists(candidate)) {
			return candidate;
		}
	}

	throw new Error(`No free temporary name in "${folder === "" ? "/" : folder}".`);
}

/** Puts every file back under the name it had, as far as that still works. */
export async function revertRenames(
	host: ImageRenameHost,
	operations: RenameOperation[],
): Promise<void> {
	for (let index = operations.length - 1; index >= 0; index -= 1) {
		const operation = operations[index];

		if (operation.currentPath === operation.originalPath) {
			continue;
		}

		try {
			await host.renameFile(operation.currentPath, operation.originalPath);
			operation.currentPath = operation.originalPath;
		} catch {
			// Reverting is a best effort; the remaining files are still tried.
		}
	}
}

/**
 * Carries out the plan and returns the renames that were performed.
 *
 * An image is renamed straight to its new name as soon as that name is free.
 * Only images that stand in each other's way — a note where `Test 10.png` has
 * to become `Test 05.png` while another image becomes `Test 10.png` — need a
 * name nothing else can hold in between, and only one of them does, so the
 * ring is opened and the rest follows it. No file is ever overwritten.
 *
 * When a rename fails, the ones that already happened are taken back and the
 * error is rethrown, leaving the vault as it was.
 */
export async function executeRenamePlan(
	host: ImageRenameHost,
	entries: RenameEntry[],
): Promise<RenameOperation[]> {
	const operations = new Map<string, RenameOperation>();

	/** Moves one image, remembering where it now is. */
	async function move(entry: RenameEntry, to: string): Promise<void> {
		const operation = operations.get(entry.file.path);

		await host.renameFile(operation === undefined ? entry.file.path : operation.currentPath, to);

		if (operation === undefined) {
			operations.set(entry.file.path, { originalPath: entry.file.path, currentPath: to });
		} else {
			operation.currentPath = to;
		}
	}

	/** Where the image of an entry sits at this moment. */
	function pathOf(entry: RenameEntry): string {
		return operations.get(entry.file.path)?.currentPath ?? entry.file.path;
	}

	let remaining = entries.filter((entry) => entry.targetPath !== entry.file.path);

	try {
		while (remaining.length > 0) {
			const occupied = new Set(remaining.map(pathOf));
			const free = remaining.filter((entry) => !occupied.has(entry.targetPath));

			if (free.length === 0) {
				// Every image left waits for another one to move away first, so one
				// of them is taken out of the ring.
				const entry = remaining[0];

				await move(entry, temporaryPath(host, pathOf(entry), operations.size));
				continue;
			}

			for (const entry of free) {
				await move(entry, entry.targetPath);
			}

			remaining = remaining.filter((entry) => free.indexOf(entry) === -1);
		}
	} catch (error) {
		await revertRenames(host, [...operations.values()]);
		throw error;
	}

	return [...operations.values()];
}

function renamedFiles(entries: RenameEntry[]): RenamedFile[] {
	return entries.map((entry) => ({
		originalPath: entry.file.path,
		file: { path: entry.targetPath, extension: entry.file.extension },
	}));
}

async function renameImages(host: ImageRenameHost): Promise<ImageRenameOutcome> {
	const source = await host.readNote();
	const resolved: ResolvedEmbed[] = findImageEmbeds(source).map((embed) => ({
		embed,
		file: host.resolveImage(embed.path),
	}));

	if (resolved.length === 0) {
		return { kind: "no-images" };
	}

	const plan = buildRenamePlan(
		host.noteName,
		resolved,
		(path) => host.notesUsingImage(path).length > 0,
	);
	const conflict = findRenameConflict(plan.entries, (path) => host.exists(path));

	if (conflict !== null) {
		return { kind: "conflict", path: conflict.targetPath, from: conflict.file.path };
	}

	const edits = collectLinkEdits(resolved, plan.entries);
	let operations: RenameOperation[];

	try {
		operations = await executeRenamePlan(host, plan.entries);
	} catch (error) {
		return { kind: "failed", message: describeError(error) };
	}

	try {
		const current = await host.readNote();

		// Obsidian rewrites internal links itself unless the user turned that off,
		// in which case the note is still untouched and the planned edits apply.
		await host.updateNote(
			current === source
				? edits
				: collectRepairEdits(current, renamedFiles(plan.entries), (path) =>
						host.resolveImage(path),
					),
		);
	} catch (error) {
		await revertRenames(host, operations);
		return { kind: "failed", message: describeError(error) };
	}

	return {
		kind: "renamed",
		renamed: operations.length,
		skipped: plan.unresolved,
		shared: plan.shared,
	};
}

/**
 * Renames every image embedded in the note after the note itself, numbering
 * them in order of first appearance, and points the links of the note at the
 * new names.
 *
 * Nothing at all is changed when a target name is taken by a file outside of
 * the operation, or when any of the renames fails. Every failure is reported
 * through the returned outcome, so the call never rejects.
 */
export async function renameNoteImages(host: ImageRenameHost | null): Promise<ImageRenameOutcome> {
	if (host === null) {
		return { kind: "no-note" };
	}

	try {
		return await renameImages(host);
	} catch (error) {
		return { kind: "failed", message: describeError(error) };
	}
}

/** The part of the notice that lists what was left alone, if anything was. */
function describeSkipped(skipped: number, shared: number): string {
	const parts: string[] = [];

	if (skipped > 0) {
		parts.push(`${skipped} unresolved ${skipped === 1 ? "link" : "links"}`);
	}

	if (shared > 0) {
		parts.push(`${shared} ${shared === 1 ? "image" : "images"} used in other notes`);
	}

	return parts.length === 0 ? "" : `, skipped ${parts.join(" and ")}`;
}

/** The notice shown for an outcome. */
export function describeOutcome(outcome: ImageRenameOutcome): string {
	switch (outcome.kind) {
		case "no-note":
			return "No active Markdown note.";
		case "no-images":
			return "No images are embedded in the current note.";
		case "conflict":
			return (
				`Nothing was renamed: "${fileName(outcome.from)}" cannot become ` +
				`"${fileName(outcome.path)}", which another file of the folder already ` +
				`carries. That file is not embedded in this note.`
			);
		case "failed":
			return `Could not rename the images: ${outcome.message}`;
		case "renamed":
			return outcome.renamed === 0
				? `The images are already named correctly${describeSkipped(outcome.skipped, outcome.shared)}.`
				: `Renamed ${outcome.renamed} ${outcome.renamed === 1 ? "image" : "images"}${describeSkipped(outcome.skipped, outcome.shared)}.`;
	}
}

/**
 * What the renaming came to, as one part of a notice about a note several
 * rules were applied to, or `null` when there was nothing to rename at all.
 */
export function summarizeRename(outcome: ImageRenameOutcome): string | null {
	if (outcome.kind !== "renamed") {
		return null;
	}

	const skipped = describeSkipped(outcome.skipped, outcome.shared);

	return outcome.renamed === 0
		? `the images are already named correctly${skipped}`
		: `renamed ${outcome.renamed} ${outcome.renamed === 1 ? "image" : "images"}${skipped}`;
}
