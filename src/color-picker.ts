export type Hsv = [number, number, number];

export function hexToHsv(hex: string, previous: Hsv = [0, 100, 100]): Hsv {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = !delta ? previous[0] : 60 * (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return [(hue + 360) % 360, max ? delta / max * 100 : previous[1], max * 100];
}

export function hsvToHex([h, s, v]: Hsv): string {
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    return Math.round(255 * v / 100 * (1 - s / 100 * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
