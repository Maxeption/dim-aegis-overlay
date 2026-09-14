import { clampChroma, convertOkhslToOklab, convertOklabToOkhsl, convertOklabToRgb, convertRgbToOklab, formatHex, modeOklch, parseHex, useMode } from 'culori/fn';

useMode(modeOklch);

export function gradeGradientEnd(color: string): string {
  const source = convertRgbToOklab(parseHex(color)!);
  const hsl = convertOklabToOkhsl(source);
  const hue = hsl.h ?? 0;
  const saturation = Math.max(0, Math.min(1, hsl.s));
  const redDistance = ((hue - 30 + 540) % 360) - 180;
  const cool = (1 + Math.cos((hue - 210) * Math.PI / 180)) / 2;
  const shift = 60 * (2 * cool ** 2 - 1)
    * (1 - Math.exp(-((redDistance / 35) ** 2))) * saturation;
  const shade = convertOkhslToOklab({
    h: hue + shift,
    s: 1 - (1 - saturation) / (1 + 1.5 * saturation ** 2),
    l: Math.max(0, Math.min(1, hsl.l)) * (.5 + .3 * saturation),
  });
  // Allow vivid colors more chroma while keeping pastels restrained.
  const maxChroma = source.l > 0
    ? Math.hypot(source.a, source.b) * shade.l / source.l * (1 + 1.5 * saturation ** 2)
    : 0;
  const chroma = Math.hypot(shade.a, shade.b);
  const scale = chroma > 0 ? Math.min(1, maxChroma / chroma) : 0;
  return formatHex(clampChroma(convertOklabToRgb({ ...shade, a: shade.a * scale, b: shade.b * scale }), 'oklch'))!;
}
