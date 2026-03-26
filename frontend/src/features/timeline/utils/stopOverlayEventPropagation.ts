import type { SyntheticEvent } from "react";

export function stopOverlayEventPropagation(
  event: SyntheticEvent<HTMLElement>,
) {
  event.stopPropagation();
}
