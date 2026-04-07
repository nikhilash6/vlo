import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Button, Chip, IconButton, Typography } from "@mui/material";
import {
  BackspaceOutlined,
  ClearOutlined,
  EditOutlined,
  SwapHorizOutlined,
} from "@mui/icons-material";
import type {
  MaskBooleanExpression,
  MaskBooleanOperator,
  MaskTimelineClip,
} from "../../../types/TimelineTypes";
import {
  appendMaskBooleanExpression,
  cycleMaskBooleanOperator,
  type MaskBooleanExpressionPath,
  collectMaskBooleanExpressionMaskIds,
  createMaskBooleanMaskRef,
  getMaskBooleanExpressionAtPath,
  getMaskLocalId,
  isMaskBooleanOperationExpression,
  removeMaskBooleanExpressionAtPath,
  replaceMaskBooleanExpressionAtPath,
  setMaskBooleanExpressionOperatorAtPath,
  swapMaskBooleanExpressionOperandsAtPath,
} from "../model/maskBooleanExpression";

interface MaskEquationBuilderProps {
  masks: MaskTimelineClip[];
  expression: MaskBooleanExpression | null;
  onExpressionChange: (expression: MaskBooleanExpression | null) => void;
  onOpenMaskDetail: (maskId: string) => void;
  addAction?: ReactNode;
}

const OPERATOR_LABELS: Record<MaskBooleanOperator, string> = {
  union: "Union",
  intersect: "Intersect",
  subtract: "Minus",
};

function arePathsEqual(
  left: MaskBooleanExpressionPath,
  right: MaskBooleanExpressionPath,
): boolean {
  return (
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

function coerceSelectedPath(
  expression: MaskBooleanExpression | null,
  path: MaskBooleanExpressionPath,
): MaskBooleanExpressionPath {
  if (!expression) {
    return [];
  }

  let nextPath = path;
  while (
    nextPath.length > 0 &&
    !getMaskBooleanExpressionAtPath(expression, nextPath)
  ) {
    nextPath = nextPath.slice(0, -1);
  }

  return nextPath;
}

export function MaskEquationBuilder({
  masks,
  expression,
  onExpressionChange,
  onOpenMaskDetail,
  addAction,
}: MaskEquationBuilderProps) {
  const [selectedPath, setSelectedPath] = useState<MaskBooleanExpressionPath>(
    [],
  );

  useEffect(() => {
    if (!expression) {
      setSelectedPath([]);
      return;
    }

    setSelectedPath((currentPath) => coerceSelectedPath(expression, currentPath));
  }, [expression]);

  const maskEntries = useMemo(
    () =>
      masks
        .map((mask, index) => {
          const localId = getMaskLocalId(mask);
          if (!localId) {
            return null;
          }

          return {
            clip: mask,
            index,
            localId,
            label: `Mask ${index + 1}`,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            clip: MaskTimelineClip;
            index: number;
            localId: string;
            label: string;
          } => !!entry,
        ),
    [masks],
  );
  const maskLabelById = useMemo(
    () => new Map(maskEntries.map((entry) => [entry.localId, entry.label] as const)),
    [maskEntries],
  );
  const referencedMaskIds = useMemo(
    () => new Set(collectMaskBooleanExpressionMaskIds(expression)),
    [expression],
  );
  const selectedNode = useMemo(
    () => getMaskBooleanExpressionAtPath(expression, selectedPath),
    [expression, selectedPath],
  );

  const handleSelectPath = (path: MaskBooleanExpressionPath) => {
    setSelectedPath(path);
  };

  const handleUseMask = (maskId: string) => {
    const maskRef = createMaskBooleanMaskRef(maskId);

    if (!expression) {
      onExpressionChange(maskRef);
      setSelectedPath([]);
      return;
    }

    const targetPath = selectedNode ? selectedPath : [];
    const node =
      getMaskBooleanExpressionAtPath(expression, targetPath) ?? expression;
    if (!node) {
      onExpressionChange(maskRef);
      setSelectedPath([]);
      return;
    }

    onExpressionChange(
      replaceMaskBooleanExpressionAtPath(
        expression,
        targetPath,
        appendMaskBooleanExpression(node, maskId),
      ),
    );
    setSelectedPath(targetPath);
  };

  const handleDeleteSelected = () => {
    if (!expression) {
      return;
    }

    const nextExpression = removeMaskBooleanExpressionAtPath(
      expression,
      selectedPath,
    );
    onExpressionChange(nextExpression);
    setSelectedPath(selectedPath.slice(0, -1));
  };

  const handleSwapSelected = () => {
    if (!expression || !isMaskBooleanOperationExpression(selectedNode)) {
      return;
    }

    onExpressionChange(
      swapMaskBooleanExpressionOperandsAtPath(expression, selectedPath),
    );
  };

  const helperText = !expression
    ? "Click a mask chip to start the equation."
    : selectedNode?.kind === "operation"
      ? "Click a mask chip to union it into the selected group. Click the operator chip to cycle it."
      : "Select a mask or group, then click another mask chip to union it into that part of the equation.";

  const renderNode = (
    node: MaskBooleanExpression,
    path: MaskBooleanExpressionPath,
  ): ReactNode => {
    const isSelected = arePathsEqual(path, selectedPath);

    if (node.kind === "mask_ref") {
      return (
        <Chip
          data-testid={`mask-equation-mask-${path.join("-") || "root"}`}
          label={maskLabelById.get(node.maskId) ?? `Mask ${node.maskId}`}
          size="small"
          color={isSelected ? "primary" : "default"}
          variant={isSelected ? "filled" : "outlined"}
          onClick={(event) => {
            event.stopPropagation();
            handleSelectPath(path);
          }}
          sx={{ height: 24 }}
        />
      );
    }

    return (
      <Box
        data-testid={`mask-equation-group-${path.join("-") || "root"}`}
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          handleSelectPath(path);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleSelectPath(path);
          }
        }}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          px: 0.75,
          py: 0.5,
          borderRadius: 999,
          border: "1px solid",
          borderColor: isSelected ? "primary.main" : "#2f333a",
          bgcolor: isSelected ? "rgba(25, 118, 210, 0.12)" : "transparent",
          minHeight: 32,
        }}
      >
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          (
        </Typography>
        {renderNode(node.left, [...path, "left"])}
        <Chip
          label={OPERATOR_LABELS[node.operator]}
          size="small"
          color={isSelected ? "primary" : "default"}
          variant={isSelected ? "filled" : "outlined"}
          onClick={(event) => {
            event.stopPropagation();
            if (!expression) {
              return;
            }
            setSelectedPath(path);
            onExpressionChange(
              setMaskBooleanExpressionOperatorAtPath(
                expression,
                path,
                cycleMaskBooleanOperator(node.operator),
              ),
            );
          }}
          sx={{ height: 24 }}
        />
        {renderNode(node.right, [...path, "right"])}
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          )
        </Typography>
      </Box>
    );
  };

  return (
    <Box sx={{ px: 2, pb: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 1 }}
        >
          Available Masks
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, width: "100%" }}>
          {maskEntries.map((entry) => (
            <Box
              key={entry.clip.id}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
            >
              <Chip
                data-testid={`mask-variable-chip-${entry.localId}`}
                label={entry.label}
                size="small"
                color={referencedMaskIds.has(entry.localId) ? "primary" : "default"}
                variant={referencedMaskIds.has(entry.localId) ? "filled" : "outlined"}
                onClick={() => handleUseMask(entry.localId)}
                sx={{ height: 24 }}
              />
              <IconButton
                data-testid={`mask-edit-button-${entry.localId}`}
                aria-label={`Edit ${entry.label}`}
                size="small"
                onClick={() => onOpenMaskDetail(entry.localId)}
                sx={{
                  border: "1px solid",
                  borderColor: "#2f333a",
                  borderRadius: 999,
                  p: 0.5,
                }}
              >
                <EditOutlined sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          ))}
          {addAction}
        </Box>
      </Box>

      <Box>
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 1 }}
        >
          Equation
        </Typography>
        {expression ? (
          <Box
            data-testid="mask-equation"
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              minHeight: 32,
              alignItems: "center",
            }}
          >
            {renderNode(expression, [])}
          </Box>
        ) : (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", minHeight: 20 }}
          >
            No equation yet.
          </Typography>
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            data-testid="mask-equation-swap"
            variant="outlined"
            size="small"
            startIcon={<SwapHorizOutlined fontSize="small" />}
            disabled={!isMaskBooleanOperationExpression(selectedNode)}
            onClick={handleSwapSelected}
            sx={{ textTransform: "none", flex: 1 }}
          >
            Swap
          </Button>
          <Button
            data-testid="mask-equation-delete"
            variant="outlined"
            size="small"
            startIcon={<BackspaceOutlined fontSize="small" />}
            disabled={!expression}
            onClick={handleDeleteSelected}
            sx={{ textTransform: "none", flex: 1 }}
          >
            Delete Selected
          </Button>
          <Button
            data-testid="mask-equation-clear"
            variant="outlined"
            size="small"
            startIcon={<ClearOutlined fontSize="small" />}
            disabled={!expression}
            onClick={() => {
              onExpressionChange(null);
              setSelectedPath([]);
            }}
            sx={{ textTransform: "none", flex: 1 }}
          >
            Clear
          </Button>
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {helperText}
        </Typography>
      </Box>
    </Box>
  );
}
