import type { App } from "obsidian";
import { AbstractInputSuggest, TFolder } from "obsidian";

/**
 * Offers the folders of the vault while a folder is being typed. The picked
 * folder is handed on so that the setting can be saved right away.
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private readonly onPick: (path: string) => void;

	constructor(app: App, input: HTMLInputElement, onPick: (path: string) => void) {
		super(app, input);

		this.onPick = onPick;
	}

	protected getSuggestions(query: string): TFolder[] {
		const wanted = query.trim().toLowerCase();
		const folders: TFolder[] = [];

		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (file instanceof TFolder && !file.isRoot() && file.path.toLowerCase().includes(wanted)) {
				folders.push(file);
			}
		}

		return folders.sort((left, right) => left.path.localeCompare(right.path));
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.onPick(folder.path);
		this.close();
	}
}
