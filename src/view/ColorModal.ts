import { type App, Modal, Setting } from "obsidian";
import { FALLBACK_CUSTOM_COLOR, normalizeHexColor } from "../domain/palette";

interface ColorModalOptions {
  title: string;
  /** Hex seed for the picker; non-hex current values fall back to a neutral default. */
  initialValue?: string;
  onSubmit: (value: string) => void;
}

/** Hex color prompt backed by the native color picker; submits on button click. */
export class ColorModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly options: ColorModalOptions,
  ) {
    super(app);
    this.value = options.initialValue ?? FALLBACK_CUSTOM_COLOR;
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    new Setting(this.contentEl).setName("Color").addColorPicker((picker) =>
      picker.setValue(this.value).onChange((value) => {
        this.value = normalizeHexColor(value);
      }),
    );
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("Apply")
        .setCta()
        .onClick(() => {
          this.close();
          this.options.onSubmit(this.value);
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
