/** Returns the folder of a vault path, or an empty string for the vault root. */
export function parentPath(path: string): string {
	const separator = path.lastIndexOf("/");

	return separator === -1 ? "" : path.slice(0, separator);
}

/** Returns the last segment of a vault path. */
export function fileName(path: string): string {
	const separator = path.lastIndexOf("/");

	return separator === -1 ? path : path.slice(separator + 1);
}

/** Returns the extension of a file name without the dot, or an empty string. */
export function fileExtension(path: string): string {
	const name = fileName(path);
	const dot = name.lastIndexOf(".");

	return dot <= 0 ? "" : name.slice(dot + 1);
}

/** Joins a folder and a name, tolerating an empty folder. */
export function joinPath(folder: string, name: string): string {
	return folder === "" ? name : `${folder}/${name}`;
}

/**
 * Resolves a possibly relative link path against the folder of the note that
 * contains it. Leading `./` and `../` segments are collapsed; anything else is
 * returned unchanged apart from redundant separators.
 */
export function resolveRelativePath(folder: string, path: string): string {
	const segments = folder === "" ? [] : folder.split("/");

	for (const segment of path.split("/")) {
		if (segment === "" || segment === ".") {
			continue;
		}

		if (segment === "..") {
			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	return segments.join("/");
}
