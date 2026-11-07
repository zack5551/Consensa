import type { BoardStrings } from "@/components/board-view";
import type { Dictionary } from "@/i18n/dictionaries/en";

/** Only the slices the board needs cross to the browser, not the whole dictionary. */
export function boardStrings(t: Dictionary): BoardStrings {
  return {
    board: t.board,
    browse: { sortLabel: t.browse.sortLabel, sorts: t.browse.sorts, shown: t.browse.shown, shownOne: t.browse.shownOne, tableCaption: t.browse.tableCaption },
    states: t.states,
    question: { poll: t.question.poll, yourCall: t.question.yourCall, canadaSays: t.question.canadaSays },
  };
}
