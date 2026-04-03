import { Filter, Texture } from "pixi.js";

const defaultVertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

function createFragmentSource(mode: "max" | "min"): string {
  const combineExpression =
    mode === "max"
      ? "max(baseCoverage, compareCoverage)"
      : "min(baseCoverage, compareCoverage)";

  return `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uCompareTexture;

float resolveCoverage(vec4 color)
{
    return max(color.r, color.a);
}

void main(void)
{
    vec4 baseColor = texture(uTexture, vTextureCoord);
    vec4 compareColor = texture(uCompareTexture, vTextureCoord);
    float baseCoverage = resolveCoverage(baseColor);
    float compareCoverage = resolveCoverage(compareColor);
    float coverage = ${combineExpression};
    finalColor = vec4(coverage, coverage, coverage, coverage);
}
`;
}

/**
 * Combines two mask textures in shared red-channel mask space.
 *
 * We resolve coverage from `max(red, alpha)` so post-blur masks retain their
 * soft edge even if Pixi stores the strongest signal in alpha for a given pass.
 * The output is then normalized back into both red and alpha for subsequent
 * mask-composition stages.
 */
export function createMaskCoverageCombineFilter(mode: "max" | "min"): Filter {
  return Filter.from({
    gl: {
      vertex: defaultVertex,
      fragment: createFragmentSource(mode),
    },
    resources: {
      uCompareTexture: Texture.EMPTY.source,
    },
  });
}
