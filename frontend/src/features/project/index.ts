export { ProjectManager } from "./components/ProjectManager";
export { ProjectTitle } from "./components/ProjectTitle";
export { useProjectStore } from "./useProjectStore";
export { fileSystemService } from "./services/FileSystemService";
export { projectDocumentService } from "./services/ProjectDocumentService";
export {
  PROJECT_ASPECT_RATIOS,
  EXACT_INPUT_ASPECT_RATIO_TOOLTIP,
} from "./aspectRatioOptions";
export type {
  ProjectState,
  ProjectConfig,
  AspectRatio,
} from "./useProjectStore";
export type { ProjectDocument, TimelineSnapshot } from "./types/ProjectDocument";
