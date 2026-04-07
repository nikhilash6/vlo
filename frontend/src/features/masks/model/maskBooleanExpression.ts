import type {
  MaskBooleanExpression,
  MaskBooleanOperationExpression,
  MaskBooleanOperator,
  MaskTimelineClip,
  StandardTimelineClip,
} from "../../../types/TimelineTypes";

const MASK_CLIP_ID_SEPARATOR = "::mask::";

export type MaskBooleanExpressionPath = Array<"left" | "right">;

function foldMaskExpressions(
  expressions: readonly MaskBooleanExpression[],
  operator: MaskBooleanOperator,
): MaskBooleanExpression | null {
  if (expressions.length === 0) {
    return null;
  }

  return expressions.reduce<MaskBooleanExpression | null>((current, expression) => {
    if (!current) {
      return structuredClone(expression);
    }

    return {
      kind: "operation",
      operator,
      left: current,
      right: structuredClone(expression),
    };
  }, null);
}

function filterMaskBooleanExpression(
  expression: MaskBooleanExpression,
  predicate: (maskId: string) => boolean,
): MaskBooleanExpression | null {
  if (expression.kind === "mask_ref") {
    return predicate(expression.maskId) ? structuredClone(expression) : null;
  }

  const left = filterMaskBooleanExpression(expression.left, predicate);
  const right = filterMaskBooleanExpression(expression.right, predicate);

  if (left && right) {
    return {
      kind: "operation",
      operator: expression.operator,
      left,
      right,
    };
  }

  return left ?? right ?? null;
}

export function createMaskBooleanMaskRef(maskId: string): MaskBooleanExpression {
  return {
    kind: "mask_ref",
    maskId,
  };
}

export function getMaskLocalIdFromMaskClipId(maskClipId: string): string | null {
  const idx = maskClipId.indexOf(MASK_CLIP_ID_SEPARATOR);
  if (idx <= 0) {
    return null;
  }

  const maskId = maskClipId.slice(idx + MASK_CLIP_ID_SEPARATOR.length);
  return maskId || null;
}

export function getMaskLocalId(
  maskClip: Pick<MaskTimelineClip, "id">,
): string | null {
  return getMaskLocalIdFromMaskClipId(maskClip.id);
}

export function collectMaskBooleanExpressionMaskIds(
  expression: MaskBooleanExpression | null | undefined,
): string[] {
  if (!expression) {
    return [];
  }

  if (expression.kind === "mask_ref") {
    return [expression.maskId];
  }

  return [
    ...collectMaskBooleanExpressionMaskIds(expression.left),
    ...collectMaskBooleanExpressionMaskIds(expression.right),
  ];
}

export function countMaskBooleanOperationNodes(
  expression: MaskBooleanExpression | null | undefined,
): number {
  if (!expression || expression.kind !== "operation") {
    return 0;
  }

  return (
    1 +
    countMaskBooleanOperationNodes(expression.left) +
    countMaskBooleanOperationNodes(expression.right)
  );
}

export function sanitizeMaskBooleanExpression(
  expression: MaskBooleanExpression,
  availableMaskIds: Iterable<string>,
): MaskBooleanExpression | null {
  const availableMaskIdSet = new Set(availableMaskIds);
  return filterMaskBooleanExpression(
    expression,
    (maskId) => availableMaskIdSet.has(maskId),
  );
}

export function pruneMaskBooleanExpression(
  expression: MaskBooleanExpression,
  removedMaskIds: Iterable<string>,
): MaskBooleanExpression | null {
  const removedMaskIdSet = new Set(removedMaskIds);
  return filterMaskBooleanExpression(
    expression,
    (maskId) => !removedMaskIdSet.has(maskId),
  );
}

export function resolveLegacyMaskBooleanExpression(
  maskClips: readonly MaskTimelineClip[],
): MaskBooleanExpression | null {
  const applyMaskRefs = maskClips
    .filter((maskClip) => maskClip.maskMode === "apply")
    .map((maskClip) => getMaskLocalId(maskClip))
    .filter((maskId): maskId is string => !!maskId)
    .map((maskId) => {
      const maskClip = maskClips.find(
        (candidate) => getMaskLocalId(candidate) === maskId,
      );
      return {
        maskId,
        maskClip,
      };
    });

  const regularMasks = applyMaskRefs
    .filter(({ maskClip }) => !maskClip?.maskInverted)
    .map(({ maskId }) => createMaskBooleanMaskRef(maskId));
  const invertedMasks = applyMaskRefs
    .filter(({ maskClip }) => maskClip?.maskInverted)
    .map(({ maskId }) => createMaskBooleanMaskRef(maskId));

  const regularExpression = foldMaskExpressions(regularMasks, "union");
  if (regularExpression) {
    return invertedMasks.reduce<MaskBooleanExpression>(
      (current, invertedExpression) => ({
        kind: "operation",
        operator: "intersect",
        left: current,
        right: structuredClone(invertedExpression),
      }),
      regularExpression,
    );
  }

  return foldMaskExpressions(invertedMasks, "intersect");
}

export function resolveMaskBooleanExpression(
  parentClip: Pick<StandardTimelineClip, "maskBooleanExpression">,
  maskClips: readonly MaskTimelineClip[],
): MaskBooleanExpression | null {
  if (parentClip.maskBooleanExpression === null) {
    return null;
  }

  if (parentClip.maskBooleanExpression !== undefined) {
    const availableMaskIds = maskClips
      .map((maskClip) => getMaskLocalId(maskClip))
      .filter((maskId): maskId is string => !!maskId);
    return sanitizeMaskBooleanExpression(
      parentClip.maskBooleanExpression,
      availableMaskIds,
    );
  }

  return resolveLegacyMaskBooleanExpression(maskClips);
}

export function getMaskBooleanExpressionAtPath(
  expression: MaskBooleanExpression | null | undefined,
  path: MaskBooleanExpressionPath,
): MaskBooleanExpression | null {
  if (!expression) {
    return null;
  }

  let current: MaskBooleanExpression = expression;
  for (const segment of path) {
    if (current.kind !== "operation") {
      return null;
    }
    current = current[segment];
  }

  return current;
}

function updateMaskBooleanExpressionAtPath(
  expression: MaskBooleanExpression,
  path: MaskBooleanExpressionPath,
  updater: (node: MaskBooleanExpression) => MaskBooleanExpression | null,
): MaskBooleanExpression | null {
  if (path.length === 0) {
    return updater(expression);
  }

  if (expression.kind !== "operation") {
    return structuredClone(expression);
  }

  const [segment, ...rest] = path;
  const siblingSegment = segment === "left" ? "right" : "left";
  const updatedChild = updateMaskBooleanExpressionAtPath(
    expression[segment],
    rest,
    updater,
  );

  if (!updatedChild) {
    return structuredClone(expression[siblingSegment]);
  }

  return {
    kind: "operation",
    operator: expression.operator,
    left:
      segment === "left"
        ? updatedChild
        : structuredClone(expression.left),
    right:
      segment === "right"
        ? updatedChild
        : structuredClone(expression.right),
  };
}

export function replaceMaskBooleanExpressionAtPath(
  expression: MaskBooleanExpression,
  path: MaskBooleanExpressionPath,
  replacement: MaskBooleanExpression,
): MaskBooleanExpression {
  return (
    updateMaskBooleanExpressionAtPath(
      expression,
      path,
      () => structuredClone(replacement),
    ) ?? structuredClone(replacement)
  );
}

export function removeMaskBooleanExpressionAtPath(
  expression: MaskBooleanExpression,
  path: MaskBooleanExpressionPath,
): MaskBooleanExpression | null {
  return updateMaskBooleanExpressionAtPath(expression, path, () => null);
}

export function setMaskBooleanExpressionOperatorAtPath(
  expression: MaskBooleanExpression,
  path: MaskBooleanExpressionPath,
  operator: MaskBooleanOperator,
): MaskBooleanExpression {
  return (
    updateMaskBooleanExpressionAtPath(expression, path, (node) => {
      if (node.kind !== "operation") {
        return structuredClone(node);
      }

      return {
        kind: "operation",
        operator,
        left: structuredClone(node.left),
        right: structuredClone(node.right),
      };
    }) ?? structuredClone(expression)
  );
}

export function swapMaskBooleanExpressionOperandsAtPath(
  expression: MaskBooleanExpression,
  path: MaskBooleanExpressionPath,
): MaskBooleanExpression {
  return (
    updateMaskBooleanExpressionAtPath(expression, path, (node) => {
      if (node.kind !== "operation") {
        return structuredClone(node);
      }

      return {
        kind: "operation",
        operator: node.operator,
        left: structuredClone(node.right),
        right: structuredClone(node.left),
      };
    }) ?? structuredClone(expression)
  );
}

export function collectUnionMaskIds(
  expression: MaskBooleanExpression | null | undefined,
): string[] | null {
  if (!expression) {
    return null;
  }

  if (expression.kind === "mask_ref") {
    return [expression.maskId];
  }

  if (expression.operator !== "union") {
    return null;
  }

  const left = collectUnionMaskIds(expression.left);
  const right = collectUnionMaskIds(expression.right);
  if (!left || !right) {
    return null;
  }

  return [...left, ...right];
}

export function isMaskBooleanOperationExpression(
  expression: MaskBooleanExpression | null | undefined,
): expression is MaskBooleanOperationExpression {
  return !!expression && expression.kind === "operation";
}
