import { createContext, useContext } from "react";

/**
 * In-place text editing on the canvas. Kept apart from the shared node callbacks because it
 * changes on every edit: folding it in would re-render every card and cluster on the board
 * instead of the one being edited.
 */
export interface TextEditing {
  editingId: string | null;
  onCommit: (id: string, value: string) => void;
  onCancel: () => void;
}

export const TextEditingContext = createContext<TextEditing | null>(null);

export function useTextEditing(): TextEditing | null {
  return useContext(TextEditingContext);
}
