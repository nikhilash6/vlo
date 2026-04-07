import { describe, expect, it } from "vitest";
import { TEMP_WORKFLOW_ID } from "../constants";
import {
  buildWorkflowMenuSections,
  resolveWorkflowPersistenceId,
  sortWorkflowOptions,
  upsertTempWorkflowOption,
} from "../workflowCatalog";

describe("workflowCatalog", () => {
  it("prefers the selected workflow id for temporary duplicate filenames", () => {
    expect(resolveWorkflowPersistenceId("wf.json", "wf (1).json")).toBe(
      "wf.json",
    );
  });

  it("keeps synthetic temp editor filenames unsaved", () => {
    expect(resolveWorkflowPersistenceId(TEMP_WORKFLOW_ID, "__temp__.json")).toBe(
      null,
    );
  });

  it("adds a temp workflow option with the stable temp id", () => {
    const workflows = upsertTempWorkflowOption([], {
      workflow: {},
      graphData: {},
      inputs: [],
    });

    expect(workflows).toEqual([
      {
        id: TEMP_WORKFLOW_ID,
        name: "Edited Workflow",
      },
    ]);
  });

  it("sorts workflow options by configured group order before name", () => {
    const workflows = sortWorkflowOptions([
      { id: "core-b.json", name: "Beta", groupId: "core", groupName: "Core", groupOrder: 1 },
      { id: "default-z.json", name: "Zeta", groupId: "default", groupName: "Default", groupOrder: 0 },
      { id: "other-a.json", name: "Alpha" },
      { id: "default-a.json", name: "Alpha", groupId: "default", groupName: "Default", groupOrder: 0 },
    ]);

    expect(workflows.map((workflow) => workflow.id)).toEqual([
      "default-a.json",
      "default-z.json",
      "core-b.json",
      "other-a.json",
    ]);
  });

  it("builds grouped workflow menu sections and labels ungrouped entries as other", () => {
    const sections = buildWorkflowMenuSections([
      { id: "core.json", name: "Core Workflow", groupId: "core", groupName: "Core", groupOrder: 1 },
      { id: "default.json", name: "Default Workflow", groupId: "default", groupName: "Default", groupOrder: 0 },
      { id: "custom.json", name: "Custom Workflow" },
    ]);

    expect(sections).toEqual([
      {
        key: "default",
        label: "Default",
        order: 0,
        workflows: [
          { id: "default.json", name: "Default Workflow", groupId: "default", groupName: "Default", groupOrder: 0 },
        ],
      },
      {
        key: "core",
        label: "Core",
        order: 1,
        workflows: [
          { id: "core.json", name: "Core Workflow", groupId: "core", groupName: "Core", groupOrder: 1 },
        ],
      },
      {
        key: "__ungrouped__",
        label: "Other",
        order: 1000000,
        workflows: [
          { id: "custom.json", name: "Custom Workflow" },
        ],
      },
    ]);
  });
});
