import type { App } from "obsidian";
import { AbstractInputSuggest, TFile } from "obsidian";

/** The extension of the files a base of the memes can be kept in. */
const BASE_EXTENSION = "base";

/**
 * Offers the bases of the vault while one is being typed. The picked file is
 * handed on so that the setting can be saved right away.
 */
export class BaseSuggest extends AbstractInputSuggest<TFile> {
	private readonly onPick: (path: string) => void;

	constructor(app: App, input: HTMLInputElement, onPick: (path: string) => void) {
		super(app, input);

		this.onPick = onPick;
	}

	protected getSuggestions(query: string): TFile[] {
		const wanted = query.trim().toLowerCase();
		const bases: TFile[] = [];

		for (const file of this.app.vault.getFiles()) {
			if (file.extension === BASE_EXTENSION && file.path.toLowerCase().includes(wanted)) {
				bases.push(file);
			}
		}

		return bases.sort((left, right) => left.path.localeCompare(right.path));
	}

	renderSuggestion(base: TFile, el: HTMLElement): void {
		el.setText(base.path);
	}

	selectSuggestion(base: TFile): void {
		this.setValue(base.path);
		this.onPick(base.path);
		this.close();
	}
}
