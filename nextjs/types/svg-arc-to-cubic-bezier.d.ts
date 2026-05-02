declare module 'svg-arc-to-cubic-bezier' {
  export default function arcToBezier(input: {
    px: number;
    py: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    xAxisRotation: number;
    largeArcFlag: boolean;
    sweepFlag: boolean;
  }): Array<{ x: number; y: number; x1: number; y1: number; x2: number; y2: number }>;
}
