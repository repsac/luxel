void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = fragCoord / iResolution.xy;
    vec3 color = vec3(uv.x, uv.y, 0.35 + 0.25 * sin(iTime));
    fragColor = vec4(color, 1.0);
}
