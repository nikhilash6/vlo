import { containTemplate } from "./contain";
import { coverTemplate } from "./cover";
import type { TransformTemplate } from "../../types";

export const TemplateRegistry: Record<string, TransformTemplate> = {
  contain: containTemplate,
  cover: coverTemplate,
};
