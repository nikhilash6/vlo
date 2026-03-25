import type { WorkflowWidgetInput } from "../types";

function normalizeWidgetLabel(label: string | undefined): string {
  return label?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

export function isAspectRatioWidget(widget: WorkflowWidgetInput): boolean {
  return (
    widget.param === "aspect_ratio" ||
    normalizeWidgetLabel(widget.config.label) === "aspect ratio"
  );
}
