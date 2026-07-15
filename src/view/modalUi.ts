import { Modal } from "obsidian";

/** Base of the plugin's dialogs: applies the shared chrome scope and cleans up content. */
export class RoadmapModal extends Modal {
  onOpen(): void {
    this.modalEl.addClass("rm-modal");
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Right-aligned dialog footer; `column` stacks full-width buttons instead. */
export function createModalFooter(contentEl: HTMLElement, column = false): HTMLElement {
  return contentEl.createDiv({
    cls: column ? ["rm-modal__footer", "rm-modal__footer--column"] : ["rm-modal__footer"],
  });
}

export function addCancelButton(footer: HTMLElement, close: () => void): void {
  const button = footer.createEl("button", { cls: ["rm-modal__btn", "rm-modal__btn--ghost"], text: "Cancel" });

  button.addEventListener("click", close);
}

export function addPrimaryButton(footer: HTMLElement, label: string, onClick: () => void): void {
  const button = footer.createEl("button", { cls: ["rm-modal__btn", "rm-modal__btn--primary"], text: label });

  button.addEventListener("click", onClick);
}
