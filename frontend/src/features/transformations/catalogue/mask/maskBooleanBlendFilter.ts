import {
  Filter,
  GlProgram,
  Matrix,
  Sprite,
  Texture,
  UniformGroup,
} from "pixi.js";
import type { FilterSystem, RenderSurface } from "pixi.js";
import type { MaskBooleanOperator } from "../../../../types/TimelineTypes";

const defaultVertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vLeftCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
uniform mat3 uLeftFilterMatrix;

vec4 filterVertexPosition(vec2 aPosition)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(vec2 aPosition)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

vec2 getLeftCoord(vec2 aPosition)
{
    return (uLeftFilterMatrix * vec3(filterTextureCoord(aPosition), 1.0)).xy;
}

void main(void)
{
    gl_Position = filterVertexPosition(aPosition);
    vTextureCoord = filterTextureCoord(aPosition);
    vLeftCoord = getLeftCoord(aPosition);
}
`;

const coverageExpressionByOperator: Record<MaskBooleanOperator, string> = {
  union: "max(leftCoverage, rightCoverage)",
  intersect: "leftCoverage * rightCoverage",
  subtract: "leftCoverage * (1.0 - rightCoverage)",
};

const inverseCoverageExpressionByOperator: Record<MaskBooleanOperator, string> = {
  union: "1.0 - max(1.0 - leftCoverage, 1.0 - rightCoverage)",
  intersect: "1.0 - ((1.0 - leftCoverage) * (1.0 - rightCoverage))",
  subtract: "1.0 - ((1.0 - leftCoverage) * rightCoverage)",
};

function createFragmentSource(operator: MaskBooleanOperator): string {
  return `
in vec2 vTextureCoord;
in vec2 vLeftCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLeftTexture;
uniform vec4 uInputClamp;
uniform vec4 uLeftClamp;
uniform float uOperateOnInverseCoverage;

float readMaskCoverage(sampler2D maskTexture, vec2 uv, vec4 clampFrame)
{
    float clip = step(3.5,
        step(clampFrame.x, uv.x) +
        step(clampFrame.y, uv.y) +
        step(uv.x, clampFrame.z) +
        step(uv.y, clampFrame.w));

    return texture(maskTexture, clamp(uv, clampFrame.xy, clampFrame.zw)).r * clip;
}

void main(void)
{
    float leftCoverage = readMaskCoverage(uLeftTexture, vLeftCoord, uLeftClamp);
    float rightCoverage = readMaskCoverage(uTexture, vTextureCoord, uInputClamp);
    float coverage = uOperateOnInverseCoverage == 1.0
        ? ${inverseCoverageExpressionByOperator[operator]}
        : ${coverageExpressionByOperator[operator]};

    finalColor = vec4(coverage, coverage, coverage, coverage);
}
`;
}

type MaskBooleanFilterUniforms = UniformGroup<{
  uLeftFilterMatrix: { value: Matrix; type: "mat3x3<f32>" };
  uLeftClamp: { value: Float32Array; type: "vec4<f32>" };
  uOperateOnInverseCoverage: { value: number; type: "f32" };
}>;

/**
 * Aligns the left-hand operand with the filtered input texture using Pixi's
 * sprite-matrix calculation. This keeps both operands in the same coordinate
 * space even when the filter system pads or offsets the temporary input frame.
 */
export class MaskBooleanBlendFilter extends Filter {
  private leftTexture: Texture = Texture.EMPTY;
  private readonly referenceSprite: Sprite;

  constructor(operator: MaskBooleanOperator, referenceSprite: Sprite) {
    super({
      glProgram: GlProgram.from({
        vertex: defaultVertex,
        fragment: createFragmentSource(operator),
        name: `mask-boolean-${operator}-blend-filter`,
      }),
      resources: {
        filterUniforms: new UniformGroup({
          uLeftFilterMatrix: {
            value: new Matrix(),
            type: "mat3x3<f32>",
          },
          uLeftClamp: {
            value: new Float32Array([0, 0, 1, 1]),
            type: "vec4<f32>",
          },
          uOperateOnInverseCoverage: {
            value: 0,
            type: "f32",
          },
        }),
        uLeftTexture: Texture.EMPTY.source,
      },
    });

    this.referenceSprite = referenceSprite;
  }

  public setLeftTexture(texture: Texture) {
    this.leftTexture = texture;
  }

  public setOperateOnInverseCoverage(value: boolean) {
    const filterUniforms = this.resources
      .filterUniforms as MaskBooleanFilterUniforms;
    filterUniforms.uniforms.uOperateOnInverseCoverage = value ? 1 : 0;
  }

  public apply(
    filterManager: FilterSystem,
    input: Texture,
    output: RenderSurface,
    clearMode: boolean,
  ) {
    const leftTextureMatrix = this.leftTexture.textureMatrix;
    leftTextureMatrix.update();

    const filterUniforms = this.resources
      .filterUniforms as MaskBooleanFilterUniforms;
    const uniforms = filterUniforms.uniforms;

    filterManager
      .calculateSpriteMatrix(uniforms.uLeftFilterMatrix, this.referenceSprite)
      .prepend(leftTextureMatrix.mapCoord);
    uniforms.uLeftClamp.set(leftTextureMatrix.uClampFrame);

    this.resources.uLeftTexture = this.leftTexture.source;
    filterManager.applyFilter(this, input, output, clearMode);
  }
}

export function createMaskBooleanBlendFilter(
  operator: MaskBooleanOperator,
  referenceSprite: Sprite,
): MaskBooleanBlendFilter {
  return new MaskBooleanBlendFilter(operator, referenceSprite);
}
