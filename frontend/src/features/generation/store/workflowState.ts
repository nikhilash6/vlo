import {
  createDefaultWorkflowRules,
  resolvePresentedInputsFromRules,
  resolveWidgetInputsFromRules,
  type WorkflowRules,
} from "../services/workflowRules";
import type { WorkflowInput } from "../types";
import { extractWorkflowNodeMap } from "../utils/workflowNodeSignature";

export const EMPTY_WORKFLOW_RULES: WorkflowRules = createDefaultWorkflowRules();

function parseReferencedNodeId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const [nodeId] = trimmed.split(":", 1);
  return nodeId?.trim() || null;
}

function collectReferencedRuleNodeIds(
  value: unknown,
  result: Set<string>,
  key = "",
): void {
  const normalizedKey = key.trim().toLowerCase();

  if (typeof value === "string") {
    if (
      normalizedKey.endsWith("node_id") ||
      normalizedKey === "input"
    ) {
      const nodeId = parseReferencedNodeId(value);
      if (nodeId) {
        result.add(nodeId);
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    if (normalizedKey === "inputs") {
      for (const entry of value) {
        if (typeof entry !== "string") {
          continue;
        }
        const nodeId = parseReferencedNodeId(entry);
        if (nodeId) {
          result.add(nodeId);
        }
      }
      return;
    }

    for (const entry of value) {
      collectReferencedRuleNodeIds(entry, result, key);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (
    normalizedKey === "nodes" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const nodeId of Object.keys(value as Record<string, unknown>)) {
      result.add(nodeId);
    }
  }

  for (const [childKey, childValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    collectReferencedRuleNodeIds(childValue, result, childKey);
  }
}

export function areWorkflowRulesCompatibleWithWorkflow(
  workflow: Record<string, unknown> | null | undefined,
  rules: WorkflowRules | null | undefined,
): boolean {
  if (!workflow || !rules) {
    return true;
  }

  const workflowNodeIds = new Set(extractWorkflowNodeMap(workflow).keys());
  if (workflowNodeIds.size === 0) {
    return true;
  }

  const referencedRuleNodeIds = new Set<string>();
  collectReferencedRuleNodeIds(rules, referencedRuleNodeIds);
  if (referencedRuleNodeIds.size === 0) {
    return true;
  }

  for (const nodeId of referencedRuleNodeIds) {
    if (!workflowNodeIds.has(nodeId)) {
      return false;
    }
  }

  return true;
}

export function applyPresentationRules(
  inferredInputs: WorkflowInput[],
  rules: WorkflowRules | null,
  workflow?: Record<string, unknown> | null,
) {
  return resolvePresentedInputsFromRules(
    inferredInputs,
    rules ?? EMPTY_WORKFLOW_RULES,
    workflow,
  );
}

export function resolveWidgetInputs(
  workflow: Record<string, unknown> | null,
  rules: WorkflowRules | null,
) {
  return resolveWidgetInputsFromRules(workflow, rules ?? EMPTY_WORKFLOW_RULES);
}
