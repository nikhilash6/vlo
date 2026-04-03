import {
  AlphaMask,
  Container,
  type Filter,
  Graphics,
  Matrix,
  RenderTexture,
  Sprite,
  Texture,
} from "pixi.js";
import { KawaseBlurFilter } from "pixi-filters";
import type { Renderer } from "pixi.js";
import type {
  TimelineClip,
  MaskTimelineClip,
} from "../../../types/TimelineTypes";
import type { Asset } from "../../../types/Asset";
import {
  applyClipTransforms,
  calculateClipTime,
} from "../../transformations";
import { dispatchTransform } from "../../transformations/catalogue/TransformationRegistry";
import type { TransformState } from "../../transformations/catalogue/types";
import { createMaskBinaryThresholdFilter } from "../../transformations/catalogue/mask/maskBinaryThresholdFilter";
import { createMaskRedInvertForMultiplyFilter } from "../../transformations/catalogue/mask/maskRedInvertForMultiplyFilter";
import { createMaskRedToAlphaFilter } from "../../transformations/catalogue/mask/maskRedToAlphaFilter";
import { drawMaskBaseShape } from "../model/maskFactory";
import {
  calculatePlayerFrameTime,
  snapFrameTimeSeconds,
} from "../../renderer";
import { MaskVideoFramePlayer } from "./MaskVideoFramePlayer";

const MASK_EDGE_BLUR_SCALE = 0.5;
const MASK_EDGE_BLUR_QUALITY = 3;

interface VectorMaskNode {
  root: Container;
  graphics: Graphics;
  spriteHost: Container;
  sprite: Sprite;
  shapeSignature: string;
  rasterSignature: string;
  rasterTexture: RenderTexture | null;
  rasterWidth: number;
  rasterHeight: number;
  presentation: "graphics" | "sprite";
}

interface AssetMaskNode {
  root: Container;
  player: MaskVideoFramePlayer;
  assetId: string;
  thresholdFilter: Filter;
}

type MaskApplicationMode = "none" | "regular" | "alpha";

interface ResolvedMaskCompositeState {
  growAmount: number;
  feather:
    | {
        amount: number;
        mode: "hard_outer" | "soft_inner" | "two_way";
      }
    | null;
}

function getAssetBackedMaskId(maskClip: MaskTimelineClip): string | null {
  if (maskClip.maskType === "sam2") {
    return maskClip.sam2MaskAssetId ?? null;
  }
  if (maskClip.maskType === "generation") {
    return maskClip.generationMaskAssetId ?? null;
  }
  return null;
}

function isAssetBackedMask(maskClip: MaskTimelineClip): boolean {
  return getAssetBackedMaskId(maskClip) !== null;
}

function getMaskContentSize(clip: MaskTimelineClip): {
  width: number;
  height: number;
} {
  const params = clip.maskParameters;
  return {
    width: Math.max(1, params?.baseWidth ?? 1),
    height: Math.max(1, params?.baseHeight ?? 1),
  };
}

function getMaskShapeSignature(clip: MaskTimelineClip): string {
  return JSON.stringify({
    type: clip.maskType,
    baseWidth: clip.maskParameters?.baseWidth,
    baseHeight: clip.maskParameters?.baseHeight,
  });
}

function getMaskVideoSpriteContentSize(
  sprite: Sprite,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  const texture = sprite.texture;
  if (
    texture &&
    texture !== Texture.EMPTY &&
    texture.width > 0 &&
    texture.height > 0
  ) {
    return { width: texture.width, height: texture.height };
  }
  return fallback;
}

/**
 * Manages mask application on a frame Sprite.
 *
 * When a PixiJS `Renderer` is provided, masks are composited into a
 * `RenderTexture` at the content's native resolution and applied via
 * AlphaMask's *direct-sprite* path (`renderMaskToTexture = false`).
 * This bypasses `AlphaMaskPipe`'s render-to-texture pipeline whose
 * `bounds.ceil()` rounding causes UV misalignment during viewport zoom.
 *
 * When no renderer is available (unit tests), falls back to the old
 * Container-based AlphaMask approach.
 */
export class SpriteClipMaskController {
  private readonly sprite: Sprite;
  private readonly maskContainer: Container;
  private readonly maskRootContainer: Container | null;
  private readonly maskTarget: Container;
  private readonly vectorMaskNodes = new Map<string, VectorMaskNode>();
  private readonly assetMaskNodes = new Map<string, AssetMaskNode>();

  // Renderer-based compositing (null = fallback to old approach)
  private readonly renderer: Renderer | null;
  private maskSprite: Sprite | null = null;
  private maskRenderTexture: RenderTexture | null = null;
  private perMaskRenderTexture: RenderTexture | null = null;
  private effectMaskRenderTexture: RenderTexture | null = null;
  private presentationMaskRenderTexture: RenderTexture | null = null;
  private perMaskSprite: Sprite | null = null;
  private solidMaskSprite: Sprite | null = null;
  private maskInvertFilter: Filter | null = null;
  private maskBinaryThresholdFilter: Filter | null = null;
  private maskRedToAlphaFilter: Filter | null = null;
  private kawaseBlurFilter: KawaseBlurFilter | null = null;

  private alphaMaskEffect: AlphaMask | null = null;
  private currentMaskMode: MaskApplicationMode = "none";
  private currentInverse = false;
  private lastContentWidth = 0;
  private lastContentHeight = 0;
  private outputMode: "scene" | "mask" = "scene";

  constructor(
    sprite: Sprite,
    renderer?: Renderer | null,
    maskRootContainer?: Container | null,
  ) {
    this.sprite = sprite;
    this.renderer = renderer ?? null;
    this.maskRootContainer = maskRootContainer ?? null;
    this.maskTarget = sprite as unknown as Container;
    this.maskContainer = new Container();

    // Keep mask nodes as siblings under a Container host (never under Sprite),
    // matching Pixi v8 scene-graph constraints.
    if (this.renderer) {
      // Renderer available: keep maskContainer in the track scene graph so
      // stencil-mask paths always have a valid root hierarchy.
      this.maskContainer.visible = false;

      // We still render maskContainer into a RenderTexture for alpha-mask paths.
      this.maskSprite = new Sprite();
      this.maskSprite.anchor.set(0.5);
      this.maskSprite.visible = false;
      this.maskSprite.renderable = false;
    }

    this.ensureMaskSceneNodesAttached();
    this.syncOutputModeVisibility();
  }

  public setOutputMode(mode: "scene" | "mask") {
    if (this.outputMode === mode) return;
    this.outputMode = mode;
    this.syncOutputModeVisibility();
  }

  /**
   * Sync masks from first-class mask TimelineClips.
   * Includes vector masks and asset-backed raster video masks.
   */
  public async syncMaskClips(
    maskClips: MaskTimelineClip[],
    parentClip: TimelineClip,
    logicalDimensions: { width: number; height: number },
    rawTimeTicks: number,
    assetsById: Map<string, Asset>,
    options: {
      fps?: number;
      waitForSam2?: boolean;
      skipSam2FrameRender?: boolean;
    } = {},
  ) {
    this.ensureMaskSceneNodesAttached();
    this.syncMaskSpriteTransform();

    const {
      fps,
      waitForSam2 = false,
      skipSam2FrameRender = false,
    } = options;
    // These legacy option names now gate all asset-backed mask video decoding.
    // Generation masks intentionally share the same render path as SAM2 masks.
    const activeMaskClips = maskClips.filter(
      (clip) => {
        if (clip.maskMode !== "apply") return false;
        const assetMaskId = getAssetBackedMaskId(clip);
        return assetMaskId === null || assetsById.has(assetMaskId);
      },
    );
    const activeVectorMasks = activeMaskClips.filter(
      (clip) =>
        !isAssetBackedMask(clip) &&
        clip.maskType !== "sam2" &&
        clip.maskType !== "generation",
    );
    const activeAssetMasks = activeMaskClips.filter((clip) =>
      isAssetBackedMask(clip),
    );
    const effectiveMaskCount = activeMaskClips.length;

    if (effectiveMaskCount === 0) {
      this.clear();
      return;
    }

    this.reconcileVectorNodes(activeVectorMasks.map((clip) => clip.id));
    this.reconcileAssetMaskNodes(
      activeAssetMasks.map((clip) => ({
        maskId: clip.id,
        assetId: getAssetBackedMaskId(clip) as string,
      })),
    );

    activeVectorMasks.forEach((maskClip) => {
      const node = this.vectorMaskNodes.get(maskClip.id);
      if (!node) return;
      node.root.visible = true;

      const maskContentSize = getMaskContentSize(maskClip);
      const shapeSignature = getMaskShapeSignature(maskClip);
      if (node.shapeSignature !== shapeSignature) {
        node.graphics.clear();
        drawMaskBaseShape(node.graphics, maskClip);
        node.shapeSignature = shapeSignature;
      }

      if (this.shouldRasterizeVectorMask(maskClip)) {
        // Reserved for any future vector-mask path that truly needs a local
        // raster sprite before entering the shared composite pipeline.
        this.setVectorMaskPresentation(node, "sprite");
        this.syncVectorMaskSprite(node, maskContentSize);
        applyClipTransforms(
          node.sprite,
          maskClip,
          logicalDimensions,
          rawTimeTicks,
          maskContentSize,
          { baseLayoutMode: "origin", notifyLiveParams: false },
        );
      } else {
        this.setVectorMaskPresentation(node, "graphics");
        applyClipTransforms(
          node.graphics,
          maskClip,
          logicalDimensions,
          rawTimeTicks,
          maskContentSize,
          { baseLayoutMode: "origin", notifyLiveParams: false },
        );
      }
    });

    const globalTimeTicks = parentClip.start + rawTimeTicks;
    const maskInputTimeSeconds = calculatePlayerFrameTime(
      parentClip,
      globalTimeTicks,
    );
    const requestedMaskTimeSeconds =
      typeof fps === "number" && Number.isFinite(fps) && fps > 0
        ? snapFrameTimeSeconds(maskInputTimeSeconds, fps)
        : maskInputTimeSeconds;
    const clipContentSize = this.getActiveClipContentSize(logicalDimensions);

    for (const maskClip of activeAssetMasks) {
      const maskAssetId = getAssetBackedMaskId(maskClip);
      if (!maskAssetId) continue;
      const asset = assetsById.get(maskAssetId);
      const node = this.assetMaskNodes.get(maskClip.id);
      if (!asset || !node) continue;
      node.root.visible = true;

      if (node.assetId !== asset.id) {
        node.assetId = asset.id;
        await node.player.setSource(asset);
      } else {
        await node.player.setSource(asset);
      }

      if (!skipSam2FrameRender) {
        if (waitForSam2) {
          await node.player.renderAt(requestedMaskTimeSeconds, {
            strict: true,
          });
        } else {
          void node.player
            .renderAt(requestedMaskTimeSeconds)
            .catch((error) => {
              console.warn("Mask video frame update failed", error);
            });
        }
      }

      const maskSprite = node.player.sprite;
      const maskSize = getMaskVideoSpriteContentSize(maskSprite, clipContentSize);
      applyClipTransforms(
        maskSprite,
        maskClip,
        logicalDimensions,
        rawTimeTicks,
        maskSize,
        { baseLayoutMode: "origin", notifyLiveParams: false },
      );
    }

    const singleMask = effectiveMaskCount === 1 ? activeMaskClips[0] : null;
    const sharedMaskCompositeState = this.resolveMaskCompositeState(
      parentClip,
      logicalDimensions,
      clipContentSize,
      rawTimeTicks,
    );
    const hasSharedEdgeOps =
      sharedMaskCompositeState.growAmount > 0 ||
      (sharedMaskCompositeState.feather?.amount ?? 0) > 0;
    const hasInvertedMask = activeMaskClips.some(
      (maskClip) => maskClip.maskInverted ?? false,
    );
    const shouldUseCompositedAlphaMask =
      this.renderer !== null &&
      (activeAssetMasks.length > 0 || hasInvertedMask || hasSharedEdgeOps);
    this.sanitizeAssetMaskSpriteVisibility();

    if (this.maskSprite && shouldUseCompositedAlphaMask) {
      const hasReadyAssetMask = activeAssetMasks.some((maskClip) => {
        const node = this.assetMaskNodes.get(maskClip.id);
        if (!node) return false;
        return (
          node.player.sprite.visible && this.hasUsableTexture(node.player.sprite)
        );
      });

      // Preserve prior behavior: when only asset-backed masks are active but no
      // decoded frame is ready yet, render unmasked until first frame arrives.
      if (
        (activeVectorMasks.length > 0 || hasReadyAssetMask) &&
        this.hasRenderableContentTexture()
      ) {
        this.renderMaskClipsToTexture(
          activeMaskClips,
          clipContentSize,
          sharedMaskCompositeState,
        );
        this.applyAlphaMask(this.maskSprite, false);
      } else {
        this.removeMaskFromTarget();
      }
    } else if (activeAssetMasks.length > 0 || hasInvertedMask || hasSharedEdgeOps) {
      // No renderer / no maskSprite (test fallback): Container-based AlphaMask
      const inverse = singleMask ? (singleMask.maskInverted ?? false) : false;
      this.applyMaskEffect(this.maskContainer, inverse, true);
    } else {
      // Vector-only: stencil mask
      const inverse = singleMask ? (singleMask.maskInverted ?? false) : false;
      this.applyMaskEffect(this.maskContainer, inverse, false);
    }
  }

  public clear() {
    this.vectorMaskNodes.forEach((node) => {
      node.graphics.clear();
      node.shapeSignature = "";
      node.rasterSignature = "";
      node.root.visible = false;
      node.sprite.visible = false;
      node.spriteHost.visible = false;
    });
    this.assetMaskNodes.forEach((node) => {
      node.player.sprite.visible = false;
      node.root.visible = false;
    });
    this.removeMaskFromTarget();
    if (this.renderer) {
      this.maskContainer.visible = false;
    }
    if (this.maskSprite) {
      this.maskSprite.visible = false;
    }
    if (this.perMaskSprite) {
      this.perMaskSprite.blendMode = "normal";
      this.perMaskSprite.filters = null;
    }
    this.syncOutputModeVisibility();
  }

  public dispose() {
    this.clear();
    this.detachAlphaMaskEffect();
    this.alphaMaskEffect?.destroy();
    this.alphaMaskEffect = null;

    this.vectorMaskNodes.forEach((node) => {
      if (node.rasterTexture) {
        node.rasterTexture.destroy(true);
        node.rasterTexture = null;
      }
      if (node.root.parent) {
        node.root.removeFromParent();
      }
      if (!node.root.destroyed) {
        node.root.destroy({ children: true });
      }
    });
    this.vectorMaskNodes.clear();

    this.assetMaskNodes.forEach((node) => {
      if (node.root.parent) {
        node.root.removeFromParent();
      }
      node.player.dispose();
      if (!node.root.destroyed) {
        node.root.destroy({ children: false });
      }
    });
    this.assetMaskNodes.clear();

    if (this.maskRenderTexture) {
      this.maskRenderTexture.destroy(true);
      this.maskRenderTexture = null;
    }
    if (this.perMaskRenderTexture) {
      this.perMaskRenderTexture.destroy(true);
      this.perMaskRenderTexture = null;
    }
    if (this.effectMaskRenderTexture) {
      this.effectMaskRenderTexture.destroy(true);
      this.effectMaskRenderTexture = null;
    }
    if (this.presentationMaskRenderTexture) {
      this.presentationMaskRenderTexture.destroy(true);
      this.presentationMaskRenderTexture = null;
    }

    if (this.maskSprite) {
      if (this.maskSprite.parent) {
        this.maskSprite.removeFromParent();
      }
      if (!this.maskSprite.destroyed) {
        this.maskSprite.destroy();
      }
      this.maskSprite = null;
    }
    if (this.perMaskSprite) {
      this.perMaskSprite.filters = null;
      if (!this.perMaskSprite.destroyed) {
        this.perMaskSprite.destroy();
      }
      this.perMaskSprite = null;
    }
    if (this.solidMaskSprite) {
      if (!this.solidMaskSprite.destroyed) {
        this.solidMaskSprite.destroy();
      }
      this.solidMaskSprite = null;
    }
    this.maskInvertFilter?.destroy();
    this.maskInvertFilter = null;
    this.maskBinaryThresholdFilter?.destroy();
    this.maskBinaryThresholdFilter = null;
    this.maskRedToAlphaFilter?.destroy();
    this.maskRedToAlphaFilter = null;
    this.kawaseBlurFilter?.destroy();
    this.kawaseBlurFilter = null;

    if (this.maskContainer.parent) {
      this.maskContainer.removeFromParent();
    }
    if (!this.maskContainer.destroyed) {
      this.maskContainer.destroy({ children: true });
    }
  }

  // ── Private: mask compositing ──────────────────────────────────────

  private resolveMaskHostContainer(): Container | null {
    const host = this.maskRootContainer ?? this.maskTarget;
    if (host && typeof host.addChild === "function") {
      return host;
    }
    return null;
  }

  private ensureMaskSceneNodesAttached() {
    const host = this.resolveMaskHostContainer();
    if (!host) return;

    if (this.maskContainer.parent !== host) {
      if (this.maskContainer.parent) {
        this.maskContainer.removeFromParent();
      }
      host.addChild(this.maskContainer);
    }

    if (this.maskSprite && this.maskSprite.parent !== host) {
      if (this.maskSprite.parent) {
        this.maskSprite.removeFromParent();
      }
      host.addChild(this.maskSprite);
    }
  }

  public syncMaskSpriteTransform() {
    if (!this.maskSprite) return;
    const maskPosition = this.maskSprite.position as {
      x: number;
      y: number;
      set?: (x: number, y: number) => void;
    };
    if (typeof maskPosition.set === "function") {
      maskPosition.set(this.sprite.position.x, this.sprite.position.y);
    } else {
      maskPosition.x = this.sprite.position.x;
      maskPosition.y = this.sprite.position.y;
    }

    const maskScale = this.maskSprite.scale as {
      x: number;
      y: number;
      set?: (x: number, y?: number) => void;
    };
    if (typeof maskScale.set === "function") {
      maskScale.set(this.sprite.scale.x, this.sprite.scale.y);
    } else {
      maskScale.x = this.sprite.scale.x;
      maskScale.y = this.sprite.scale.y;
    }

    this.maskSprite.rotation = this.sprite.rotation;
  }

  private resolveMaskCompositeState(
    parentClip: TimelineClip,
    logicalDimensions: { width: number; height: number },
    contentSize: { width: number; height: number },
    rawTimeTicks: number,
  ): ResolvedMaskCompositeState {
    if (parentClip.type === "mask") {
      return { growAmount: 0, feather: null };
    }

    const transforms = parentClip.maskCompositeTransformations ?? [];
    if (transforms.length === 0) {
      return { growAmount: 0, feather: null };
    }

    const state: TransformState = {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      filters: [],
    };
    const transformTime = calculateClipTime(parentClip, rawTimeTicks, true);

    transforms.forEach((transform) => {
      if (!transform.isEnabled) return;
      dispatchTransform(state, transform, {
        container: logicalDimensions,
        content: contentSize,
        time: transformTime,
      });
    });

    return {
      growAmount: state.maskGrow?.amount ?? 0,
      feather: state.feather ?? null,
    };
  }

  /**
   * Render all mask children in `maskContainer` to the RenderTexture.
   * In renderer mode the maskContainer lives in the track container but stays
   * hidden; we briefly toggle visibility while rendering offscreen.
   * We position it at (width/2, height/2) so children at (0,0) with
   * anchor(0.5) render centered in the texture.
   */
  private renderMasksToTexture(contentSize: {
    width: number;
    height: number;
  }) {
    if (!this.renderer) return;
    const { width, height } = contentSize;

    this.ensureMaskRenderTexture(contentSize);
    if (!this.maskRenderTexture) return;

    // Render the standalone maskContainer into the RenderTexture.
    // Use a transform that centers (0,0) at (width/2, height/2) so mask
    // children with anchor(0.5) at position (0,0) fill the texture.
    const previousMaskContainerVisibility = this.maskContainer.visible;
    this.sanitizeAssetMaskSpriteVisibility();
    this.maskContainer.visible = true;
    try {
      const transform = new Matrix().translate(width / 2, height / 2);
      this.renderer.render({
        container: this.maskContainer,
        target: this.maskRenderTexture,
        clear: true,
        transform,
      });
    } finally {
      this.maskContainer.visible = previousMaskContainerVisibility;
    }
  }

  /**
   * Renderer-only per-mask compositing path.
   *
   * Composition model:
   * 1) Union all non-inverted masks as the include region (or full-white when absent).
   * 2) Union all inverted masks.
   * 3) Multiply include by inverse(invertedUnion), i.e. `include * (1 - invertedUnion)`.
   *
   * This supports multiple inverted masks and preserves mask transforms by
   * rendering subsets through the shared `maskContainer` path.
   */
  private renderMaskClipsToTexture(
    maskClips: MaskTimelineClip[],
    contentSize: { width: number; height: number },
    compositeState: ResolvedMaskCompositeState,
  ) {
    if (!this.renderer || !this.maskSprite) return;

    this.ensureMaskRenderTexture(contentSize);
    this.ensurePerMaskRenderTexture(contentSize);
    this.ensureEffectMaskRenderTexture(contentSize);
    this.ensurePresentationMaskRenderTexture(contentSize);
    this.ensureSolidMaskSprite(contentSize);

    if (
      !this.maskRenderTexture ||
      !this.perMaskRenderTexture ||
      !this.effectMaskRenderTexture ||
      !this.presentationMaskRenderTexture ||
      !this.perMaskSprite ||
      !this.solidMaskSprite
    ) {
      return;
    }

    const nonInvertedMaskIds = new Set<string>();
    const invertedMaskIds = new Set<string>();
    maskClips.forEach((maskClip) => {
      if (!this.isMaskClipRenderable(maskClip)) return;
      if (maskClip.maskInverted ?? false) {
        invertedMaskIds.add(maskClip.id);
      } else {
        nonInvertedMaskIds.add(maskClip.id);
      }
    });

    const transform = new Matrix().translate(
      contentSize.width / 2,
      contentSize.height / 2,
    );

    if (nonInvertedMaskIds.size > 0) {
      this.renderMaskSubsetToTexture(
        nonInvertedMaskIds,
        this.maskRenderTexture,
        transform,
      );
    } else {
      this.renderer.render({
        container: this.solidMaskSprite,
        target: this.maskRenderTexture,
        clear: true,
      });
    }

    if (invertedMaskIds.size > 0) {
      this.renderMaskSubsetToTexture(
        invertedMaskIds,
        this.perMaskRenderTexture,
        transform,
      );
      this.renderTextureToTarget(this.perMaskRenderTexture, this.maskRenderTexture, {
        clear: false,
        blendMode: "multiply",
        filters: [this.getMaskInvertFilter()],
      });
    }

    const effectTexture = this.renderCompositeMaskEdgeTexture(
      this.maskRenderTexture,
      compositeState,
    );
    this.renderPresentedMaskTexture(effectTexture, contentSize);
    this.syncOutputModeVisibility();
  }

  private renderCompositeMaskEdgeTexture(
    sourceTexture: Texture,
    compositeState: ResolvedMaskCompositeState,
  ): Texture {
    if (
      !this.effectMaskRenderTexture ||
      !this.perMaskRenderTexture ||
      !this.maskRenderTexture
    ) {
      return sourceTexture;
    }

    let currentTexture = sourceTexture;
    if (compositeState.growAmount > 0) {
      this.renderBlurPass(
        currentTexture,
        this.perMaskRenderTexture,
        compositeState.growAmount,
      );
      this.renderThresholdPass(
        this.perMaskRenderTexture,
        this.effectMaskRenderTexture,
      );
      currentTexture = this.effectMaskRenderTexture;
    }

    const feather = compositeState.feather;
    if (!feather || feather.amount <= 0) {
      return currentTexture;
    }

    const outputTarget =
      currentTexture === this.effectMaskRenderTexture
        ? this.maskRenderTexture
        : this.effectMaskRenderTexture;

    if (feather.mode === "two_way") {
      this.renderBlurPass(
        currentTexture,
        outputTarget,
        feather.amount,
      );
      return outputTarget;
    }

    this.renderBlurPass(
      currentTexture,
      this.perMaskRenderTexture,
      feather.amount,
    );

    if (feather.mode === "soft_inner") {
      this.renderTextureToTarget(currentTexture, outputTarget, {
        clear: true,
      });
      this.renderTextureToTarget(
        this.perMaskRenderTexture,
        outputTarget,
        {
          clear: false,
          blendMode: "multiply",
        },
      );
      return outputTarget;
    }

    this.renderTextureToTarget(this.perMaskRenderTexture, outputTarget, {
      clear: true,
    });
    this.renderTextureToTarget(currentTexture, outputTarget, {
      clear: false,
    });

    return outputTarget;
  }

  private renderPresentedMaskTexture(
    sourceTexture: Texture,
    contentSize: { width: number; height: number },
  ) {
    if (!this.maskSprite) {
      return;
    }

    this.ensurePresentationMaskRenderTexture(contentSize);
    if (!this.presentationMaskRenderTexture) {
      return;
    }

    this.renderTextureToTarget(sourceTexture, this.presentationMaskRenderTexture, {
      clear: true,
      filters: [this.getMaskRedToAlphaFilter()],
    });
    this.maskSprite.texture = this.presentationMaskRenderTexture;
  }

  private renderBlurPass(
    sourceTexture: Texture,
    target: RenderTexture,
    amount: number,
  ) {
    this.renderTextureToTarget(sourceTexture, target, {
      clear: true,
      filters: [this.getKawaseBlurFilter(amount)],
    });
  }

  private renderThresholdPass(sourceTexture: Texture, target: RenderTexture) {
    this.renderTextureToTarget(sourceTexture, target, {
      clear: true,
      filters: [this.getMaskBinaryThresholdFilter()],
    });
  }

  private renderTextureToTarget(
    sourceTexture: Texture,
    target: RenderTexture,
    options: {
      clear?: boolean;
      blendMode?: Sprite["blendMode"];
      filters?: Filter[] | null;
    } = {},
  ) {
    if (!this.renderer || !this.perMaskSprite) return;

    this.perMaskSprite.texture = sourceTexture;
    this.perMaskSprite.filters = options.filters ?? null;
    this.perMaskSprite.blendMode = options.blendMode ?? "normal";
    this.perMaskSprite.visible = true;

    this.renderer.render({
      container: this.perMaskSprite,
      target,
      clear: options.clear ?? true,
    });

    this.perMaskSprite.filters = null;
    this.perMaskSprite.blendMode = "normal";
  }

  /**
   * Apply the composited maskSprite as an AlphaMask on the frame sprite.
   * Since maskSprite is a Sprite, AlphaMask uses the direct-sprite path
   * (`renderMaskToTexture = false`) — no intermediate texture or bounds
   * rounding by AlphaMaskPipe.
   */
  private applyAlphaMask(target: Sprite, inverse: boolean) {
    const previousMode = this.currentMaskMode;

    if (previousMode === "regular") {
      this.setMaskOnTarget(null, false);
    }

    const targetChanged =
      this.alphaMaskEffect && this.alphaMaskEffect.mask !== target;

    if (
      this.currentMaskMode !== "alpha" ||
      this.currentInverse !== inverse ||
      targetChanged
    ) {
      if (previousMode === "alpha") {
        this.detachAlphaMaskEffect();
      }

      // (Re)create AlphaMask if the target sprite changed
      if (!this.alphaMaskEffect || this.alphaMaskEffect.mask !== target) {
        this.alphaMaskEffect?.destroy();
        this.alphaMaskEffect = new AlphaMask({ mask: target });
      }

      this.alphaMaskEffect.inverse = inverse;
      this.attachAlphaMaskEffect();
      this.currentMaskMode = "alpha";
      this.currentInverse = inverse;
    }
    this.syncOutputModeVisibility();
  }

  // ── Private: fallback mask application (no renderer) ───────────────

  private applyMaskEffect(
    mask: Container | null,
    inverse: boolean,
    useAlphaMask: boolean,
  ) {
    const previousMode = this.currentMaskMode;
    const nextMode: MaskApplicationMode =
      mask === null ? "none" : useAlphaMask ? "alpha" : "regular";

    if (
      this.currentMaskMode === nextMode &&
      this.currentInverse === inverse
    ) {
      return;
    }

    if (previousMode === "alpha") {
      this.detachAlphaMaskEffect();
    }

    this.currentMaskMode = nextMode;
    this.currentInverse = inverse;

    if (!mask) {
      this.removeMaskFromTarget();
      return;
    }

    if (nextMode === "regular") {
      this.syncOutputModeVisibility();
      this.setMaskOnTarget(mask, inverse);
      return;
    }

    if (nextMode === "alpha") {
      if (previousMode === "regular") {
        this.setMaskOnTarget(null, false);
      }

      if (!this.alphaMaskEffect || this.alphaMaskEffect.mask !== mask) {
        this.alphaMaskEffect?.destroy();
        this.alphaMaskEffect = new AlphaMask({ mask });
      }
      this.alphaMaskEffect.inverse = inverse;
      this.attachAlphaMaskEffect();
      this.syncOutputModeVisibility();
    }
  }

  // ── Private: scene graph helpers ───────────────────────────────────

  private createVectorMaskSpriteHost(
    texture: RenderTexture | null,
  ): Pick<VectorMaskNode, "spriteHost" | "sprite"> {
    const spriteHost = new Container();
    const sprite = new Sprite(texture ?? Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.visible = false;
    spriteHost.visible = false;
    spriteHost.addChild(sprite);

    return { spriteHost, sprite };
  }

  private shouldRasterizeVectorMask(maskClip: MaskTimelineClip): boolean {
    void maskClip;
    return false;
  }

  private setVectorMaskPresentation(
    node: VectorMaskNode,
    presentation: VectorMaskNode["presentation"],
  ) {
    if (node.presentation === presentation) return;

    node.presentation = presentation;
    node.graphics.visible = presentation === "graphics";
    node.spriteHost.visible = presentation === "sprite";
    if (presentation === "graphics") {
      node.sprite.visible = false;
    }
  }

  private syncVectorMaskSprite(
    node: VectorMaskNode,
    contentSize: { width: number; height: number },
  ) {
    if (!this.renderer) return;

    const textureChanged = this.ensureVectorMaskRenderTexture(node, contentSize);
    if (!node.rasterTexture) return;

    if (textureChanged || node.rasterSignature !== node.shapeSignature) {
      // The source Graphics may have been used directly on prior frames, so
      // reset it back to the canonical base shape before rasterizing.
      const graphicsPosition = node.graphics.position as {
        x: number;
        y: number;
        set?: (x: number, y: number) => void;
      };
      if (typeof graphicsPosition.set === "function") {
        graphicsPosition.set(0, 0);
      } else {
        graphicsPosition.x = 0;
        graphicsPosition.y = 0;
      }

      const graphicsScale = node.graphics.scale as {
        x: number;
        y: number;
        set?: (x: number, y?: number) => void;
      };
      if (typeof graphicsScale.set === "function") {
        graphicsScale.set(1, 1);
      } else {
        graphicsScale.x = 1;
        graphicsScale.y = 1;
      }

      node.graphics.rotation = 0;
      (
        node.graphics as Graphics & {
          filters?: readonly unknown[] | unknown[] | null;
        }
      ).filters = null;

      const previousGraphicsVisibility = node.graphics.visible;
      node.graphics.visible = true;
      try {
        const transform = new Matrix().translate(
          contentSize.width / 2,
          contentSize.height / 2,
        );
        this.renderer.render({
          container: node.graphics,
          target: node.rasterTexture,
          clear: true,
          transform,
        });
        node.rasterSignature = node.shapeSignature;
      } finally {
        node.graphics.visible = previousGraphicsVisibility;
      }
    }

    if (node.sprite.texture !== node.rasterTexture) {
      node.sprite.texture = node.rasterTexture;
    }
    node.sprite.visible = true;
    node.spriteHost.visible = true;
  }

  private reconcileVectorNodes(maskIds: string[]) {
    const wanted = new Set(maskIds);
    this.vectorMaskNodes.forEach((node, maskId) => {
      if (wanted.has(maskId)) return;
      if (node.rasterTexture) {
        node.rasterTexture.destroy(true);
        node.rasterTexture = null;
      }
      if (node.root.parent) {
        node.root.removeFromParent();
      }
      if (!node.root.destroyed) {
        node.root.destroy({ children: true });
      }
      this.vectorMaskNodes.delete(maskId);
    });

    maskIds.forEach((maskId) => {
      if (this.vectorMaskNodes.has(maskId)) return;
      const root = new Container();
      const graphics = new Graphics();
      const { spriteHost, sprite } = this.createVectorMaskSpriteHost(null);
      root.addChild(graphics);
      root.addChild(spriteHost);
      this.maskContainer.addChild(root);
      this.vectorMaskNodes.set(maskId, {
        root,
        graphics,
        spriteHost,
        sprite,
        shapeSignature: "",
        rasterSignature: "",
        rasterTexture: null,
        rasterWidth: 0,
        rasterHeight: 0,
        presentation: "graphics",
      });
    });
  }

  private reconcileAssetMaskNodes(
    entries: Array<{ maskId: string; assetId: string }>,
  ) {
    const wantedMaskIds = new Set(entries.map((entry) => entry.maskId));
    this.assetMaskNodes.forEach((node, maskId) => {
      if (wantedMaskIds.has(maskId)) return;
      if (node.root.parent) {
        node.root.removeFromParent();
      }
      node.thresholdFilter.destroy();
      node.player.dispose();
      if (!node.root.destroyed) {
        node.root.destroy({ children: false });
      }
      this.assetMaskNodes.delete(maskId);
    });

    entries.forEach((entry) => {
      const existing = this.assetMaskNodes.get(entry.maskId);
      if (existing) return;
      const root = new Container();
      const player = new MaskVideoFramePlayer(entry.maskId);
      const thresholdFilter = createMaskBinaryThresholdFilter();
      player.sprite.filters = [thresholdFilter];
      root.addChild(player.sprite);
      this.maskContainer.addChild(root);
      this.assetMaskNodes.set(entry.maskId, {
        root,
        player,
        assetId: entry.assetId,
        thresholdFilter,
      });
    });
  }

  private getActiveClipContentSize(logicalDimensions: {
    width: number;
    height: number;
  }): { width: number; height: number } {
    const texture = this.sprite.texture;
    if (
      texture &&
      texture !== Texture.EMPTY &&
      texture.width > 0 &&
      texture.height > 0
    ) {
      return {
        width: texture.width,
        height: texture.height,
      };
    }
    return logicalDimensions;
  }

  private ensureMaskRenderTexture(contentSize: { width: number; height: number }) {
    const { width, height } = contentSize;
    if (
      !this.maskRenderTexture ||
      this.lastContentWidth !== width ||
      this.lastContentHeight !== height
    ) {
      if (this.maskRenderTexture) {
        this.maskRenderTexture.resize(width, height);
      } else {
        this.maskRenderTexture = RenderTexture.create({
          width,
          height,
          dynamic: true,
        });
      }
      this.lastContentWidth = width;
      this.lastContentHeight = height;
    }
  }

  private ensureVectorMaskRenderTexture(
    node: VectorMaskNode,
    contentSize: { width: number; height: number },
  ): boolean {
    const { width, height } = contentSize;
    let textureChanged = false;

    if (!node.rasterTexture) {
      node.rasterTexture = RenderTexture.create({
        width,
        height,
        dynamic: true,
      });
      textureChanged = true;
    } else if (node.rasterWidth !== width || node.rasterHeight !== height) {
      node.rasterTexture.resize(width, height);
      textureChanged = true;
    }

    node.rasterWidth = width;
    node.rasterHeight = height;
    return textureChanged;
  }

  private ensurePerMaskRenderTexture(contentSize: { width: number; height: number }) {
    const { width, height } = contentSize;
    if (!this.perMaskRenderTexture) {
      this.perMaskRenderTexture = RenderTexture.create({
        width,
        height,
        dynamic: true,
      });
    } else if (
      this.perMaskRenderTexture.width !== width ||
      this.perMaskRenderTexture.height !== height
    ) {
      this.perMaskRenderTexture.resize(width, height);
    }

    if (!this.perMaskSprite) {
      this.perMaskSprite = new Sprite();
      this.perMaskSprite.anchor.set(0);
    }
  }

  private ensureEffectMaskRenderTexture(contentSize: {
    width: number;
    height: number;
  }) {
    const { width, height } = contentSize;
    if (!this.effectMaskRenderTexture) {
      this.effectMaskRenderTexture = RenderTexture.create({
        width,
        height,
        dynamic: true,
      });
    } else if (
      this.effectMaskRenderTexture.width !== width ||
      this.effectMaskRenderTexture.height !== height
    ) {
      this.effectMaskRenderTexture.resize(width, height);
    }
  }

  private ensurePresentationMaskRenderTexture(contentSize: {
    width: number;
    height: number;
  }) {
    if (!this.maskSprite) return;
    const { width, height } = contentSize;
    if (!this.presentationMaskRenderTexture) {
      this.presentationMaskRenderTexture = RenderTexture.create({
        width,
        height,
        dynamic: true,
      });
    } else if (
      this.presentationMaskRenderTexture.width !== width ||
      this.presentationMaskRenderTexture.height !== height
    ) {
      this.presentationMaskRenderTexture.resize(width, height);
    }

    this.maskSprite.texture = this.presentationMaskRenderTexture;
  }

  private ensureSolidMaskSprite(contentSize: { width: number; height: number }) {
    if (!this.solidMaskSprite) {
      this.solidMaskSprite = new Sprite(Texture.WHITE);
      this.solidMaskSprite.anchor.set(0);
    }
    this.solidMaskSprite.width = contentSize.width;
    this.solidMaskSprite.height = contentSize.height;
  }

  private getMaskInvertFilter(): Filter {
    if (!this.maskInvertFilter) {
      this.maskInvertFilter = createMaskRedInvertForMultiplyFilter();
    }
    return this.maskInvertFilter;
  }

  private getMaskBinaryThresholdFilter(): Filter {
    if (!this.maskBinaryThresholdFilter) {
      this.maskBinaryThresholdFilter = createMaskBinaryThresholdFilter();
    }
    return this.maskBinaryThresholdFilter;
  }

  private getMaskRedToAlphaFilter(): Filter {
    if (!this.maskRedToAlphaFilter) {
      this.maskRedToAlphaFilter = createMaskRedToAlphaFilter();
    }
    return this.maskRedToAlphaFilter;
  }

  private getKawaseBlurFilter(amount: number): KawaseBlurFilter {
    if (!this.kawaseBlurFilter) {
      this.kawaseBlurFilter = new KawaseBlurFilter({
        strength: 0,
        quality: MASK_EDGE_BLUR_QUALITY,
        clamp: true,
      });
    }
    this.kawaseBlurFilter.strength = amount * MASK_EDGE_BLUR_SCALE;
    return this.kawaseBlurFilter;
  }

  private renderMaskSubsetToTexture(
    maskIds: Set<string>,
    target: RenderTexture,
    transform: Matrix,
  ) {
    if (!this.renderer) return;

    const previousMaskContainerVisibility = this.maskContainer.visible;
    const previousVectorVisibility: Array<{ root: Container; visible: boolean }> = [];
    const previousAssetMaskVisibility: Array<{
      root: Container;
      visible: boolean;
    }> = [];

    this.vectorMaskNodes.forEach((node, maskId) => {
      previousVectorVisibility.push({
        root: node.root,
        visible: node.root.visible,
      });
      node.root.visible = maskIds.has(maskId);
    });

    this.assetMaskNodes.forEach((node, maskId) => {
      const sprite = node.player.sprite;
      previousAssetMaskVisibility.push({
        root: node.root,
        visible: node.root.visible,
      });
      node.root.visible =
        maskIds.has(maskId) && sprite.visible && this.hasUsableTexture(sprite);
    });

    this.maskContainer.visible = true;
    try {
      this.renderer.render({
        container: this.maskContainer,
        target,
        clear: true,
        transform,
      });
    } finally {
      this.maskContainer.visible = previousMaskContainerVisibility;
      previousVectorVisibility.forEach((entry) => {
        entry.root.visible = entry.visible;
      });
      previousAssetMaskVisibility.forEach((entry) => {
        entry.root.visible = entry.visible;
      });
    }
  }

  private isMaskClipRenderable(maskClip: MaskTimelineClip): boolean {
    if (!isAssetBackedMask(maskClip)) {
      return this.vectorMaskNodes.has(maskClip.id);
    }
    const sprite = this.assetMaskNodes.get(maskClip.id)?.player.sprite;
    return !!(sprite && sprite.visible && this.hasUsableTexture(sprite));
  }

  private attachAlphaMaskEffect() {
    if (!this.alphaMaskEffect) return;
    if (typeof this.maskTarget.addEffect !== "function") return;
    const effects = this.maskTarget.effects ?? [];
    if (!effects.includes(this.alphaMaskEffect)) {
      this.maskTarget.addEffect(this.alphaMaskEffect);
    }
  }

  private detachAlphaMaskEffect() {
    if (!this.alphaMaskEffect) return;
    if (typeof this.maskTarget.removeEffect !== "function") return;
    const effects = this.maskTarget.effects ?? [];
    if (effects.includes(this.alphaMaskEffect)) {
      this.maskTarget.removeEffect(this.alphaMaskEffect);
    }
  }

  private removeMaskFromTarget() {
    this.currentMaskMode = "none";
    this.currentInverse = false;
    if (this.perMaskSprite) {
      this.perMaskSprite.blendMode = "normal";
      this.perMaskSprite.filters = null;
    }
    this.detachAlphaMaskEffect();
    this.setMaskOnTarget(null, false);
    this.syncOutputModeVisibility();
  }

  private setMaskOnTarget(mask: Container | null, inverse: boolean) {
    if (typeof this.maskTarget.setMask === "function") {
      this.maskTarget.setMask({ mask, inverse });
      return;
    }
    this.maskTarget.mask = mask;
  }

  private hasUsableTexture(sprite: Sprite): boolean {
    const texture = sprite.texture;
    return !!(
      texture &&
      texture !== Texture.EMPTY &&
      !texture.destroyed &&
      texture.source &&
      !(texture.source as { destroyed?: boolean }).destroyed
    );
  }

  private sanitizeAssetMaskSpriteVisibility() {
    this.assetMaskNodes.forEach((node) => {
      const sprite = node.player.sprite;
      if (sprite.visible && !this.hasUsableTexture(sprite)) {
        sprite.visible = false;
      }
    });
  }

  private hasRenderableContentTexture(): boolean {
    const texture = this.sprite.texture;
    return !!(
      texture &&
      !texture.destroyed &&
      texture.source &&
      !(texture.source as { destroyed?: boolean }).destroyed
    );
  }

  private syncOutputModeVisibility() {
    if (this.renderer) {
      this.maskContainer.visible = this.currentMaskMode === "regular";
    }

    if (!this.maskSprite) {
      return;
    }

    const hasMaskTexture = this.hasUsableTexture(this.maskSprite);
    const shouldKeepMaskSpriteActive =
      this.currentMaskMode === "alpha" && hasMaskTexture;

    // Keep the sprite visible for Pixi's direct-sprite AlphaMask path in
    // normal scene renders, but only make it renderable when exporting the
    // mask pass itself.
    this.maskSprite.visible = shouldKeepMaskSpriteActive;
    this.maskSprite.renderable =
      shouldKeepMaskSpriteActive && this.outputMode === "mask";
  }
}
