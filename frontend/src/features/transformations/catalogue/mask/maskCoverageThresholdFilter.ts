import { Filter } from "pixi.js";

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

const fragmentSrc = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    float coverage = max(color.r, color.a);
    float value = coverage >= 0.2 ? 1.0 : 0.0;
    finalColor = vec4(value, value, value, value);
}
`;

/**
 * Hard-thresholds mask coverage from a composited render texture where the
 * strongest signal may live in either red or alpha due to premultiplication.
 *
 * This is used after masks have already entered shared mask space, not on raw
 * decoded mask videos. Raw video decoding must stay red-only because non-alpha
 * videos report alpha as 1 everywhere.
 */
export function createMaskCoverageThresholdFilter(): Filter {
  return Filter.from({
    gl: {
      vertex: defaultVertex,
      fragment: fragmentSrc,
    },
  });
}
