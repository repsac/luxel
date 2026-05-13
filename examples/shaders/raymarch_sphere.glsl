// Raymarched unit sphere using Luxel's camera uniforms.
// Drag the render view to orbit; scroll to dolly.

float sphereSdf(vec3 p, float r)
{
    return length(p) - r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord * 2.0 - iResolution.xy) / iResolution.y;
    float h = tan(iCameraFov * 0.5);
    vec3 ro = iCameraPosition;
    vec3 rd = normalize(iCameraForward + uv.x * h * iCameraRight + uv.y * h * iCameraUp);

    float t = 0.0;
    float hit = 0.0;

    for (int i = 0; i < 64; i++) {
        vec3 p = ro + rd * t;
        float d = sphereSdf(p, 1.0);
        if (d < 0.001) {
            hit = 1.0;
            break;
        }
        t += d;
        if (t > 50.0) {
            break;
        }
    }

    vec3 color = mix(vec3(0.02, 0.02, 0.04), vec3(0.8, 0.55, 0.25), hit);
    fragColor = vec4(color, 1.0);
}
