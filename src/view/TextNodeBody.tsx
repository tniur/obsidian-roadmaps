import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { NodeBadges } from "./NodeBadges";
import type { NodeBodyProps } from "./nodeRegistry";
import { useTextEditing } from "./textEditingContext";

/**
 * In-place editor of a text node: Enter commits, Shift+Enter breaks the line, Escape and empty
 * input cancel. Pointer and key events stop here so the canvas neither drags the card nor fires
 * board shortcuts while typing.
 */
function TextNodeEditor({
  id,
  value,
  onCommit,
  onCancel,
}: {
  id: string;
  value: string;
  onCommit: (id: string, next: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    const el = ref.current;

    if (el !== null) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);

  const commit = (): void => {
    const next = draft.trim();

    if (next.length === 0 || next === value) {
      onCancel();

      return;
    }

    onCommit(id, next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <textarea
      ref={ref}
      className="rm-node__text-input nodrag nopan"
      value={draft}
      aria-label="Node text"
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

export function TextNodeBody({ id, data }: NodeBodyProps) {
  const editing = useTextEditing();

  if (editing !== null && editing.editingId === id) {
    return (
      <div className="rm-node__content">
        <TextNodeEditor id={id} value={data.displayTitle} onCommit={editing.onCommit} onCancel={editing.onCancel} />
      </div>
    );
  }

  return (
    <div className="rm-node__content">
      <div className="rm-node__text">{data.displayTitle}</div>
      {data.description !== undefined ? <p className="rm-node__desc">{data.description}</p> : null}
      <NodeBadges data={data} />
    </div>
  );
}
