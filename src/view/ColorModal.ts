import { Setting, type App } from "obsidian";
import { FALLBACK_CUSTOM_COLOR, normalizeHexColor } from "../domain/palette";
import { addCancelButton, addPrimaryButton, createModalFooter, RoadmapModal } from "./modalUi";

interface ColorModalOptions {
  title: string;
  /** Hex seed for the picker; non-hex current values fall back to a neutral default. */
  initialValue?: string;
  onSubmit: (value: string) => void;
}

/** Hex color prompt backed by the native color picker; Cancel and Apply in the footer. */
export class ColorModal extends RoadmapModal {
  private value: string;

  constructor(
    app: App,
    private readonly options: ColorModalOptions,
  ) {
    super(app);
    this.value = options.initialValue ?? FALLBACK_CUSTOM_COLOR;
  }

  onOpen(): void {
    super.onOpen();
    this.titleEl.setText(this.options.title);
    new Setting(this.contentEl).setName("Color").addColorPicker((picker) =>
      picker.setValue(this.value).onChange((value) => {
        this.value = normalizeHexColor(value);
      }),
    );

    const footer = createModalFooter(this.contentEl);

    addCancelButton(footer, () => this.close());
    addPrimaryButton(footer, "Apply", () => {
      this.close();
      this.options.onSubmit(this.value);
    });
  }
}
