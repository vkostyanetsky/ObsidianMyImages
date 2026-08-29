import { describe, expect, it } from "vitest";

import { mapPosition } from "../src/editor/position-mapping";
import type { LineChange } from "../src/editor/position-mapping";

// `### 8 frame` becomes `### 01 frame`: one character wider.
const changes: LineChange[] = [{ line: 1, fromCh: 4, toCh: 5, text: "01" }];

describe("mapPosition", () => {
	it("leaves positions on untouched lines alone", () => {
		expect(mapPosition({ line: 0, ch: 3 }, changes)).toEqual({ line: 0, ch: 3 });
		expect(mapPosition({ line: 2, ch: 3 }, changes)).toEqual({ line: 2, ch: 3 });
	});

	it("leaves positions before the change alone", () => {
		expect(mapPosition({ line: 1, ch: 4 }, changes)).toEqual({ line: 1, ch: 4 });
	});

	it("shifts positions after the change", () => {
		expect(mapPosition({ line: 1, ch: 5 }, changes)).toEqual({ line: 1, ch: 6 });
		expect(mapPosition({ line: 1, ch: 11 }, changes)).toEqual({ line: 1, ch: 12 });
	});

	it("clamps positions inside the replaced range to its end", () => {
		const wide: LineChange[] = [{ line: 0, fromCh: 3, toCh: 7, text: "01" }];

		expect(mapPosition({ line: 0, ch: 5 }, wide)).toEqual({ line: 0, ch: 5 });
	});

	it("accumulates the shift of several changes on one line", () => {
		const many: LineChange[] = [
			{ line: 0, fromCh: 3, toCh: 4, text: "01" },
			{ line: 0, fromCh: 8, toCh: 9, text: "02" },
		];

		expect(mapPosition({ line: 0, ch: 10 }, many)).toEqual({ line: 0, ch: 12 });
	});
});
