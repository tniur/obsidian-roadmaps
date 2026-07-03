import type { App } from "obsidian";
import type { RoadmapSession } from "../state/session";

/**
 * Narrow dependency surface handed to menus and dialogs: the live session for reads and
 * mutations, `commit` to persist and re-render after them, and the app for modals and
 * vault access. Keeps those modules decoupled from the view class.
 */
export interface BoardContext {
  app: App;
  session: RoadmapSession;
  commit: () => void;
}
