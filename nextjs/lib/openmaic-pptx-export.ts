import pptxgen from 'pptxgenjs';
import tinycolor from 'tinycolor2';
import { SVGPathData } from 'svg-pathdata';
import arcToBezier from 'svg-arc-to-cubic-bezier';
import temml from 'temml';
import { mml2omml } from 'mathml2omml';

export type OpenMaicCanvasElement = Record<string, unknown> & {
  id?: string;
  type?: string;
  content?: string;
  defaultFontName?: string;
  defaultColor?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
  fill?: string;
  color?: string;
  opacity?: number;
  src?: string;
  ext?: string;
  poster?: string;
  autoplay?: boolean;
  text?: Record<string, unknown> & { content?: string; defaultColor?: string; defaultFontName?: string; align?: string };
  outline?: { color?: string; width?: number; style?: string };
  shadow?: { h?: number; v?: number; blur?: number; color?: string };
  link?: { type?: string; target?: string };
  filters?: { opacity?: string | number };
  clip?: { shape?: string; range?: [number, number, number, number] };
  points?: [string?, string?];
  start?: [number, number];
  end?: [number, number];
  broken?: [number, number];
  broken2?: [number, number];
  curve?: [number, number];
  cubic?: [[number, number], [number, number]];
  style?: string;
  viewBox?: [number, number];
  path?: string;
  special?: boolean;
  fixedRatio?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  gradient?: { colors?: Array<{ color?: string }> };
  pattern?: string;
  data?: { labels?: string[]; series?: number[][] } | unknown[][];
  themeColors?: string[];
  chartType?: string;
  options?: Record<string, unknown>;
  textColor?: string;
  cellMinHeight?: number;
  colWidths?: number[];
  rowHeights?: number[];
  dataSource?: unknown[][];
  theme?: { color?: string; rowHeader?: boolean; rowFooter?: boolean; colHeader?: boolean; colFooter?: boolean };
  latex?: string;
  html?: string;
  strokeWidth?: number;
  align?: string;
};

export type OpenMaicCanvasSlide = {
  id?: string;
  title?: string;
  actions?: Array<Record<string, unknown>>;
  canvas?: Record<string, unknown> & {
    id?: string;
    width?: number;
    height?: number;
    background?: unknown;
    elements?: OpenMaicCanvasElement[];
  };
};

type FormatColor = { alpha: number; color: string };
type AstNode = { type: string; content?: string; tagName?: string; attributes?: Array<{ key: string; value: string | null }>; children?: AstNode[] };
type SvgPoint = { x?: number; y?: number; curve?: { type: 'cubic' | 'quadratic'; x1?: number; y1?: number; x2?: number; y2?: number }; close?: boolean; relative?: boolean; type?: string };

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_FAMILY = 'Microsoft YaHei';
const DEFAULT_CANVAS_WIDTH = 960;
const DEFAULT_CANVAS_HEIGHT = 540;
const SVG_PREFIX = 'data:image/svg+xml;base64,';
const chartTypeMap: Record<string, pptxgen.CHART_NAME> = {
  bar: 'bar',
  column: 'bar',
  line: 'line',
  area: 'area',
  radar: 'radar',
  scatter: 'scatter',
  pie: 'pie',
  ring: 'doughnut',
};

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cleanHex(value: string): string {
  return value.replace(/^#/, '').toUpperCase();
}

function formatColor(value: unknown): FormatColor {
  if (typeof value !== 'string' || !value.trim()) return { alpha: 0, color: '000000' };
  const color = tinycolor(value);
  if (!color.isValid()) return { alpha: 0, color: '000000' };
  const alpha = color.getAlpha();
  return { alpha, color: cleanHex(alpha === 0 ? '#ffffff' : color.setAlpha(1).toHexString()) };
}

function transparency(color: FormatColor, opacity = 1): number {
  return Math.max(0, Math.min(100, (1 - color.alpha * opacity) * 100));
}

function toInch(value: unknown, ratioPx2Inch: number, fallback = 0): number {
  return numberOr(value, fallback) / ratioPx2Inch;
}

function toPoint(value: unknown, ratioPx2Pt: number, fallback = 0): number {
  return numberOr(value, fallback) / ratioPx2Pt;
}

function getElementBox(el: OpenMaicCanvasElement, ratioPx2Inch: number) {
  return {
    x: toInch(el.left, ratioPx2Inch),
    y: toInch(el.top, ratioPx2Inch),
    w: Math.max(toInch(el.width, ratioPx2Inch, 120), 0.01),
    h: Math.max(toInch(el.height, ratioPx2Inch, 60), 0.01),
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseAttributes(value: string): Array<{ key: string; value: string | null }> {
  const attributes: Array<{ key: string; value: string | null }> = [];
  const pattern = /([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const raw = match[2];
    attributes.push({ key: match[1], value: raw ? raw.replace(/^['"]|['"]$/g, '') : null });
  }
  return attributes;
}

function toAST(html: string): AstNode[] {
  const root: AstNode = { type: 'element', tagName: 'root', children: [] };
  const stack: AstNode[] = [root];
  const tokenPattern = /<!--([\s\S]*?)-->|<\/?[A-Za-z0-9!][^>]*>|[^<]+/g;
  const voidTags = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    const token = match[0];
    const parent = stack[stack.length - 1];
    if (!parent.children) parent.children = [];
    if (token.startsWith('<!--')) continue;
    if (!token.startsWith('<')) {
      parent.children.push({ type: 'text', content: token });
      continue;
    }
    if (/^<\//.test(token)) {
      const tagName = token.replace(/^<\//, '').replace(/>$/, '').trim().toLowerCase();
      let index = stack.length - 1;
      while (index > 0 && stack[index].tagName !== tagName) index -= 1;
      if (index > 0) stack.splice(index);
      continue;
    }
    const close = /\/\s*>$/.test(token);
    const inner = token.replace(/^</, '').replace(/\/?>$/, '').trim();
    const firstSpace = inner.search(/\s/);
    const tagName = (firstSpace === -1 ? inner : inner.slice(0, firstSpace)).toLowerCase();
    const attrs = firstSpace === -1 ? '' : inner.slice(firstSpace + 1);
    const node: AstNode = { type: 'element', tagName, attributes: parseAttributes(attrs), children: [] };
    parent.children.push(node);
    if (!close && !voidTags.has(tagName)) stack.push(node);
  }
  return root.children || [];
}

function styleMap(style: string | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  if (!style) return map;
  for (const item of style.split(';')) {
    const match = item.match(/([^:]+):\s*(.+)/);
    if (match) map[match[1].trim()] = match[2].trim();
  }
  return map;
}

function formatHTML(html: string | undefined, ratioPx2Pt: number): pptxgen.TextProps[] {
  const ast = toAST(html || '');
  const slices: pptxgen.TextProps[] = [];
  let bulletFlag = false;
  let indent = 0;
  const parse = (nodes: AstNode[], baseStyle: Record<string, string> = {}) => {
    for (const item of nodes) {
      const tagName = item.tagName || '';
      const isBlockTag = ['div', 'li', 'p'].includes(tagName);
      if (isBlockTag && slices.length) {
        const last = slices[slices.length - 1];
        last.options = { ...(last.options || {}), breakLine: true };
      }
      const localStyle = { ...baseStyle };
      const styleAttr = item.attributes?.find((attr) => attr.key === 'style')?.value;
      Object.assign(localStyle, styleMap(styleAttr));
      if (tagName === 'em') localStyle['font-style'] = 'italic';
      if (tagName === 'strong') localStyle['font-weight'] = 'bold';
      if (tagName === 'sup') localStyle['vertical-align'] = 'super';
      if (tagName === 'sub') localStyle['vertical-align'] = 'sub';
      if (tagName === 'a') localStyle.href = item.attributes?.find((attr) => attr.key === 'href')?.value || '';
      if (tagName === 'ul') localStyle['list-type'] = 'ul';
      if (tagName === 'ol') localStyle['list-type'] = 'ol';
      if (tagName === 'li') bulletFlag = true;
      if (tagName === 'p') {
        const dataIndent = item.attributes?.find((attr) => attr.key === 'data-indent')?.value;
        if (dataIndent) indent = Number(dataIndent) || 0;
      }
      if (tagName === 'br') {
        slices.push({ text: '', options: { breakLine: true } });
      } else if (item.type === 'text') {
        const text = decodeHtml(item.content || '').replace(/\n/g, '');
        if (!text) continue;
        const options: pptxgen.TextPropsOptions = {};
        if (localStyle['font-size']) options.fontSize = parseInt(localStyle['font-size'], 10) / ratioPx2Pt;
        if (localStyle.color) options.color = formatColor(localStyle.color).color;
        if (localStyle['background-color']) options.highlight = formatColor(localStyle['background-color']).color;
        const deco = `${localStyle['text-decoration-line'] || ''} ${localStyle['text-decoration'] || ''}`;
        if (deco.includes('underline')) options.underline = { color: options.color || '000000', style: 'sng' };
        if (deco.includes('line-through')) options.strike = 'sngStrike';
        if (localStyle['vertical-align'] === 'super') options.superscript = true;
        if (localStyle['vertical-align'] === 'sub') options.subscript = true;
        if (localStyle['text-align']) options.align = localStyle['text-align'] as pptxgen.HAlign;
        if (localStyle['font-weight'] === 'bold' || Number(localStyle['font-weight']) >= 600) options.bold = true;
        if (localStyle['font-style'] === 'italic') options.italic = true;
        if (localStyle['font-family']) options.fontFace = localStyle['font-family'].split(',')[0].replace(/["']/g, '');
        if (localStyle.href) options.hyperlink = { url: localStyle.href };
        if (bulletFlag) {
          options.bullet = { type: localStyle['list-type'] === 'ol' ? 'number' : 'bullet' } as pptxgen.TextPropsOptions['bullet'];
          options.paraSpaceBefore = 5 / ratioPx2Pt;
          options.indentLevel = indent;
          bulletFlag = false;
        }
        slices.push({ text, options });
      }
      if (item.children?.length) parse(item.children, localStyle);
    }
  };
  parse(ast);
  return slices.length ? slices : [{ text: decodeHtml((html || '').replace(/<[^>]+>/g, '')), options: {} }];
}

function getShadowOption(shadow: OpenMaicCanvasElement['shadow'] | undefined, ratioPx2Pt: number): pptxgen.ShadowProps | undefined {
  if (!shadow) return undefined;
  const h = numberOr(shadow.h, 0);
  const v = numberOr(shadow.v, 0);
  const color = formatColor(shadow.color || '#000000');
  let angle = 45;
  if (h === 0 && v < 0) angle = 270;
  else if (h === 0 && v > 0) angle = 90;
  else if (h < 0 && v === 0) angle = 180;
  else if (h > 0 && v === 0) angle = 0;
  else if (h > 0 && v > 0) angle = 45;
  else if (h < 0 && v > 0) angle = 135;
  else if (h < 0 && v < 0) angle = 225;
  else if (h > 0 && v < 0) angle = 315;
  return {
    type: 'outer',
    color: color.color,
    opacity: Math.max(0, Math.min(100, color.alpha * 100)),
    blur: Math.max(toPoint(shadow.blur, ratioPx2Pt), 0),
    offset: Math.max(Math.hypot(h, v) / ratioPx2Pt, 0),
    angle,
  };
}

function dashType(style?: string): 'solid' | 'dash' | 'sysDot' {
  if (style === 'dashed') return 'dash';
  if (style === 'dotted') return 'sysDot';
  return 'solid';
}

function getOutlineOption(outline: OpenMaicCanvasElement['outline'] | undefined, ratioPx2Pt: number): pptxgen.ShapeLineProps | undefined {
  if (!outline?.width) return undefined;
  const color = formatColor(outline.color || '#000000');
  return {
    color: color.color,
    transparency: transparency(color),
    width: Math.max(toPoint(outline.width, ratioPx2Pt), 0.25),
    dashType: dashType(outline.style),
  };
}

function getElementLineOption(el: OpenMaicCanvasElement, ratioPx2Pt: number): pptxgen.ShapeLineProps {
  const color = formatColor(el.color || el.outline?.color || '#000000');
  return {
    color: color.color,
    transparency: transparency(color),
    width: Math.max(toPoint(el.outline?.width ?? el.width, ratioPx2Pt, 1), 0.25),
    dashType: dashType(el.style || el.outline?.style),
    beginArrowType: el.points?.[0] ? 'arrow' : 'none',
    endArrowType: el.points?.[1] ? 'arrow' : 'none',
  } as pptxgen.ShapeLineProps;
}

function getLinkOption(link: OpenMaicCanvasElement['link'] | undefined, slides: OpenMaicCanvasSlide[]): pptxgen.HyperlinkProps | undefined {
  if (!link?.target) return undefined;
  if (link.type === 'web') return { url: link.target };
  if (link.type === 'slide') {
    const index = slides.findIndex((slide) => slide.id === link.target || slide.canvas?.id === link.target);
    if (index >= 0) return { slide: index + 1 } as pptxgen.HyperlinkProps;
  }
  return undefined;
}

function isBase64Image(url: string) {
  return /^data:image\/[^;]+;base64,/.test(url);
}

function isSVGImage(url: string) {
  return /^data:image\/svg\+xml;base64,/.test(url) || /\.svg($|\?)/i.test(url);
}

function svgBase64(svg: string): string {
  return SVG_PREFIX + Buffer.from(svg, 'utf8').toString('base64');
}

function getSvgPathRange(path: string) {
  try {
    const pathData = new SVGPathData(path);
    const xList: number[] = [];
    const yList: number[] = [];
    for (const item of pathData.commands) {
      if ('x' in item && typeof item.x === 'number') xList.push(item.x);
      if ('y' in item && typeof item.y === 'number') yList.push(item.y);
    }
    return { minX: Math.min(...xList, 0), minY: Math.min(...yList, 0), maxX: Math.max(...xList, 0), maxY: Math.max(...yList, 0) };
  } catch {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

function toPoints(path: string): SvgPoint[] {
  const typeMap: Record<number, string> = { 1: 'Z', 2: 'M', 4: 'H', 8: 'V', 16: 'L', 32: 'C', 64: 'S', 128: 'Q', 256: 'T', 512: 'A' };
  const pathData = new SVGPathData(path);
  const points: SvgPoint[] = [];
  for (const item of pathData.commands) {
    const type = typeMap[item.type];
    if ((item.type === 2 || item.type === 16) && 'x' in item && 'y' in item) points.push({ x: item.x, y: item.y, relative: item.relative, type });
    else if (item.type === 32 && 'x' in item && 'y' in item) points.push({ x: item.x, y: item.y, curve: { type: 'cubic', x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 }, relative: item.relative, type });
    else if (item.type === 128 && 'x' in item && 'y' in item) points.push({ x: item.x, y: item.y, curve: { type: 'quadratic', x1: item.x1, y1: item.y1 }, relative: item.relative, type });
    else if (item.type === 512 && 'x' in item && 'y' in item) {
      const last = points[points.length - 1];
      if (!last || last.x === undefined || last.y === undefined) continue;
      const cubicBezierPoints = arcToBezier({ px: last.x, py: last.y, cx: item.x, cy: item.y, rx: item.rX, ry: item.rY, xAxisRotation: item.xRot, largeArcFlag: Boolean(item.lArcFlag), sweepFlag: Boolean(item.sweepFlag) });
      for (const cbPoint of cubicBezierPoints) points.push({ x: cbPoint.x, y: cbPoint.y, curve: { type: 'cubic', x1: cbPoint.x1, y1: cbPoint.y1, x2: cbPoint.x2, y2: cbPoint.y2 }, relative: false, type: 'C' });
    } else if (item.type === 1) points.push({ close: true, type });
  }
  return points;
}

function formatPoints(points: SvgPoint[], ratioPx2Inch: number, scale = { x: 1, y: 1 }): Array<Record<string, unknown>> {
  return points.map((point) => {
    if (point.close) return { close: true };
    const formatted: Record<string, unknown> = {
      x: ((point.x || 0) * scale.x) / ratioPx2Inch,
      y: ((point.y || 0) * scale.y) / ratioPx2Inch,
      moveTo: point.type === 'M',
    };
    if (point.curve) {
      formatted.curve = point.curve.type === 'cubic'
        ? { type: 'cubic', x1: ((point.curve.x1 || 0) * scale.x) / ratioPx2Inch, y1: ((point.curve.y1 || 0) * scale.y) / ratioPx2Inch, x2: ((point.curve.x2 || 0) * scale.x) / ratioPx2Inch, y2: ((point.curve.y2 || 0) * scale.y) / ratioPx2Inch }
        : { type: 'quadratic', x1: ((point.curve.x1 || 0) * scale.x) / ratioPx2Inch, y1: ((point.curve.y1 || 0) * scale.y) / ratioPx2Inch };
    }
    return formatted;
  });
}

function getElementRange(el: OpenMaicCanvasElement) {
  if (el.type === 'line') {
    const start = Array.isArray(el.start) ? el.start : [0, 0];
    const end = Array.isArray(el.end) ? el.end : [numberOr(el.width, 100), 0];
    return { minX: numberOr(el.left, 0), minY: numberOr(el.top, 0), maxX: numberOr(el.left, 0) + Math.max(start[0], end[0]), maxY: numberOr(el.top, 0) + Math.max(start[1], end[1]) };
  }
  return { minX: numberOr(el.left, 0), minY: numberOr(el.top, 0), maxX: numberOr(el.left, 0) + numberOr(el.width, 0), maxY: numberOr(el.top, 0) + numberOr(el.height, 0) };
}

function getLineElementPath(el: OpenMaicCanvasElement): string {
  const startArr = Array.isArray(el.start) ? el.start : [0, 0];
  const endArr = Array.isArray(el.end) ? el.end : [numberOr(el.width, 100), numberOr(el.height, 0)];
  const start = startArr.join(',');
  const end = endArr.join(',');
  if (Array.isArray(el.broken)) return `M${start} L${el.broken.join(',')} L${end}`;
  if (Array.isArray(el.broken2)) {
    const { minX, maxX, minY, maxY } = getElementRange(el);
    if (maxX - minX >= maxY - minY) return `M${start} L${el.broken2[0]},${startArr[1]} L${el.broken2[0]},${endArr[1]} ${end}`;
    return `M${start} L${startArr[0]},${el.broken2[1]} L${endArr[0]},${el.broken2[1]} ${end}`;
  }
  if (Array.isArray(el.curve)) return `M${start} Q${el.curve.join(',')} ${end}`;
  if (Array.isArray(el.cubic)) return `M${start} C${el.cubic[0].join(',')} ${el.cubic[1].join(',')} ${end}`;
  return `M${start} L${end}`;
}

function baseOptions(el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  const options: Record<string, unknown> = { ...getElementBox(el, ratioPx2Inch) };
  if (typeof el.rotate === 'number') options.rotate = el.rotate;
  if (el.shadow) options.shadow = getShadowOption(el.shadow, ratioPx2Pt);
  if (el.flipH) options.flipH = true;
  if (el.flipV) options.flipV = true;
  return options;
}

function addTextElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  const options: pptxgen.TextPropsOptions = {
    ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.TextPropsOptions),
    fontSize: DEFAULT_FONT_SIZE / ratioPx2Pt,
    fontFace: el.defaultFontName || DEFAULT_FONT_FAMILY,
    color: formatColor(el.defaultColor || '#000000').color,
    valign: 'top',
    margin: 10 / ratioPx2Pt,
    paraSpaceBefore: 5 / ratioPx2Pt,
    lineSpacingMultiple: 1.5 / 1.25,
    fit: 'shrink',
  };
  if (el.wordSpace) options.charSpacing = toPoint(el.wordSpace, ratioPx2Pt);
  if (el.lineHeight) options.lineSpacingMultiple = numberOr(el.lineHeight, 1.5) / 1.25;
  if (el.fill) {
    const fill = formatColor(el.fill);
    options.fill = { color: fill.color, transparency: transparency(fill, el.opacity === undefined ? 1 : el.opacity) };
  }
  if (el.outline?.width) options.line = getOutlineOption(el.outline, ratioPx2Pt);
  if (el.opacity !== undefined) options.transparency = (1 - numberOr(el.opacity, 1)) * 100;
  if (el.paragraphSpace !== undefined) options.paraSpaceBefore = toPoint(el.paragraphSpace, ratioPx2Pt);
  if (el.vertical) options.vert = 'eaVert';
  slide.addText(formatHTML(el.content, ratioPx2Pt), options);
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (isBase64Image(url) || url.startsWith('data:')) return url;
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
  } catch {
    return null;
  }
}

async function addImageElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number, slides: OpenMaicCanvasSlide[]) {
  const src = typeof el.src === 'string' ? el.src : '';
  const options: pptxgen.ImageProps = baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ImageProps;
  const resolved = await fetchAsDataUrl(src);
  if (resolved?.startsWith('data:')) options.data = resolved;
  else if (src) options.path = src;
  else {
    slide.addShape('rect' as pptxgen.ShapeType, { ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ShapeProps), fill: { color: 'F8EAD1', transparency: 10 }, line: { color: 'C58D3E', dashType: 'dash' } });
    slide.addText('图片资源', { ...getElementBox(el, ratioPx2Inch), color: '8F2017', fontFace: DEFAULT_FONT_FAMILY, fontSize: 12, align: 'center', valign: 'middle' });
    return;
  }
  if (el.filters?.opacity !== undefined) options.transparency = 100 - Number(el.filters.opacity);
  if (el.clip?.shape === 'ellipse') options.rounding = true;
  const link = getLinkOption(el.link, slides);
  if (link) options.hyperlink = link;
  try {
    slide.addImage(options);
  } catch {
    slide.addShape('rect' as pptxgen.ShapeType, { ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ShapeProps), fill: { color: 'F8EAD1', transparency: 10 }, line: { color: 'C58D3E', dashType: 'dash' } });
  }
}

function addShapeText(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  if (!el.text?.content) return;
  const textOptions: pptxgen.TextPropsOptions = {
    ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.TextPropsOptions),
    fontSize: DEFAULT_FONT_SIZE / ratioPx2Pt,
    fontFace: el.text.defaultFontName || DEFAULT_FONT_FAMILY,
    color: formatColor(el.text.defaultColor || '#000000').color,
    paraSpaceBefore: 5 / ratioPx2Pt,
    valign: (el.text.align as pptxgen.VAlign) || 'middle',
    fit: 'shrink',
  };
  slide.addText(formatHTML(el.text.content, ratioPx2Pt), textOptions);
}

async function addShapeElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number, slides: OpenMaicCanvasSlide[]) {
  const fillColor = el.gradient?.colors?.length
    ? formatColor(tinycolor.mix(el.gradient.colors[0]?.color || '#ffffff', el.gradient.colors[el.gradient.colors.length - 1]?.color || '#ffffff').toHexString())
    : formatColor(el.fill || '#00000000');
  const link = getLinkOption(el.link, slides);
  const common = baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ShapeProps;
  common.fill = { color: fillColor.color, transparency: transparency(fillColor, el.opacity === undefined ? 1 : el.opacity) };
  const line = getOutlineOption(el.outline, ratioPx2Pt);
  if (line) common.line = line;
  if (link) common.hyperlink = link;

  if (el.path && el.viewBox && !el.special) {
    try {
      const scale = { x: numberOr(el.width, 1) / el.viewBox[0], y: numberOr(el.height, 1) / el.viewBox[1] };
      slide.addShape('custGeom' as pptxgen.ShapeType, { ...common, points: formatPoints(toPoints(el.path), ratioPx2Inch, scale) as pptxgen.ShapeProps['points'] });
    } catch {
      slide.addShape('rect' as pptxgen.ShapeType, common);
    }
  } else if (el.path) {
    const [vbW, vbH] = el.viewBox || [numberOr(el.width, 1), numberOr(el.height, 1)];
    const fill = fillColor.alpha === 0 ? 'none' : `#${fillColor.color}`;
    const stroke = el.outline?.color ? formatColor(el.outline.color).color : 'none';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${numberOr(el.width, vbW)}" height="${numberOr(el.height, vbH)}" viewBox="0 0 ${vbW} ${vbH}"><path d="${el.path.replace(/"/g, '&quot;')}" fill="${fill}" stroke="${stroke === 'none' ? 'none' : `#${stroke}`}" stroke-width="${numberOr(el.outline?.width, 0)}"/></svg>`;
    slide.addImage({ data: svgBase64(svg), ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ImageProps), ...(link ? { hyperlink: link } : {}) });
  } else {
    slide.addShape('rect' as pptxgen.ShapeType, common);
  }

  addShapeText(slide, el, ratioPx2Inch, ratioPx2Pt);
  if (el.pattern) {
    const patternOptions: pptxgen.ImageProps = { ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ImageProps) };
    if (isBase64Image(el.pattern)) patternOptions.data = el.pattern;
    else patternOptions.path = el.pattern;
    if (link) patternOptions.hyperlink = link;
    slide.addImage(patternOptions);
  }
}

function addLineElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  try {
    const path = getLineElementPath(el);
    const points = formatPoints(toPoints(path), ratioPx2Inch);
    const { minX, maxX, minY, maxY } = getElementRange(el);
    slide.addShape('custGeom' as pptxgen.ShapeType, {
      x: toInch(el.left, ratioPx2Inch),
      y: toInch(el.top, ratioPx2Inch),
      w: Math.max((maxX - minX) / ratioPx2Inch, 0.01),
      h: Math.max((maxY - minY) / ratioPx2Inch, 0.01),
      line: getElementLineOption(el, ratioPx2Pt),
      points: points as pptxgen.ShapeProps['points'],
      shadow: getShadowOption(el.shadow, ratioPx2Pt),
    });
  } catch {
    slide.addShape('line' as pptxgen.ShapeType, { x: toInch(el.left, ratioPx2Inch), y: toInch(el.top, ratioPx2Inch), w: toInch(el.width, ratioPx2Inch, 120), h: toInch(el.height, ratioPx2Inch, 0), line: getElementLineOption(el, ratioPx2Pt) });
  }
}

function completeChartColors(colors: string[]): string[] {
  if (colors.length === 0) return ['8F2017', 'C58D3E', '4E7A51', '2D5C88', '7B4B8F'];
  if (colors.length >= 10) return colors.map((color) => formatColor(color).color);
  const supplement = tinycolor(colors[colors.length - 1]).analogous(10 + 1 - colors.length).map((color) => color.toHexString());
  return [...colors.slice(0, -1), ...supplement].map((color) => formatColor(color).color);
}

function addChartElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  const data = el.data && !Array.isArray(el.data) ? el.data as { labels?: string[]; series?: number[][] } : null;
  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const series = Array.isArray(data?.series) ? data.series : [];
  if (!labels.length || !series.length) return;
  const chartData = series.map((values, index) => ({ name: `Series ${index + 1}`, labels, values }));
  const colors = completeChartColors(Array.isArray(el.themeColors) ? el.themeColors : []);
  const type = chartTypeMap[el.chartType || 'bar'] || 'bar';
  const textColor = formatColor(el.textColor || '#000000').color;
  slide.addChart(type, chartData, {
    ...getElementBox(el, ratioPx2Inch),
    chartColors: colors,
    showLegend: true,
    showValue: el.chartType === 'pie' || el.chartType === 'ring',
    valAxisLabelColor: textColor,
    catAxisLabelColor: textColor,
    valAxisLabelFontFace: DEFAULT_FONT_FAMILY,
    catAxisLabelFontFace: DEFAULT_FONT_FAMILY,
    valAxisLabelFontSize: 10 / ratioPx2Pt,
    catAxisLabelFontSize: 10 / ratioPx2Pt,
    showCatName: true,
    showLeaderLines: true,
    holeSize: el.chartType === 'ring' ? 50 : undefined,
    ...(el.options?.stack ? { grouping: 'stacked' } : {}),
    ...(el.options?.lineSmooth ? { showSmooth: true } : {}),
  } as pptxgen.IChartOpts);
}

function tableSubThemeColor(themeColor: string) {
  const rgba = tinycolor(themeColor);
  return [rgba.setAlpha(0.3).toRgbString(), rgba.setAlpha(0.1).toRgbString()];
}

function addTableElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number) {
  const source = Array.isArray(el.data) ? el.data : Array.isArray(el.dataSource) ? el.dataSource : [];
  const hiddenCells = new Set<string>();
  const tableData: pptxgen.TableRow[] = [];
  const theme = el.theme;
  const themeColor = theme?.color ? formatColor(theme.color) : null;
  const subThemeColors = theme?.color ? tableSubThemeColor(theme.color).map(formatColor) : [];
  for (let i = 0; i < source.length; i += 1) {
    const row = Array.isArray(source[i]) ? source[i] as unknown[] : [];
    const tableRow: pptxgen.TableRow = [];
    for (let j = 0; j < row.length; j += 1) {
      if (hiddenCells.has(`${i}_${j}`)) continue;
      const cell = row[j] && typeof row[j] === 'object' ? row[j] as Record<string, unknown> : { text: String(row[j] ?? '') };
      const colspan = numberOr(cell.colspan, 1);
      const rowspan = numberOr(cell.rowspan, 1);
      for (let r = 0; r < rowspan; r += 1) for (let c = 0; c < colspan; c += 1) if (r || c) hiddenCells.add(`${i + r}_${j + c}`);
      const style = cell.style && typeof cell.style === 'object' ? cell.style as Record<string, unknown> : {};
      const options: pptxgen.TableCellProps = {
        colspan,
        rowspan,
        bold: Boolean(style.bold),
        italic: Boolean(style.em),
        underline: { style: style.underline ? 'sng' : 'none' },
        align: (style.align as pptxgen.HAlign) || 'left',
        valign: 'middle',
        fontFace: typeof style.fontname === 'string' ? style.fontname : DEFAULT_FONT_FAMILY,
        fontSize: (typeof style.fontsize === 'string' ? parseInt(style.fontsize, 10) : 14) / ratioPx2Pt,
      };
      if (theme && themeColor) {
        let fill = i % 2 === 0 ? subThemeColors[1] : subThemeColors[0];
        if ((theme.rowHeader && i === 0) || (theme.rowFooter && i === source.length - 1) || (theme.colHeader && j === 0) || (theme.colFooter && j === row.length - 1)) fill = themeColor;
        options.fill = { color: fill.color, transparency: transparency(fill) };
      }
      if (typeof style.backcolor === 'string') {
        const back = formatColor(style.backcolor);
        options.fill = { color: back.color, transparency: transparency(back) };
      }
      if (typeof style.color === 'string') options.color = formatColor(style.color).color;
      tableRow.push({ text: String(cell.text ?? cell.content ?? ''), options });
    }
    if (tableRow.length) tableData.push(tableRow);
  }
  if (!tableData.length) return;
  const tableOptions: pptxgen.TableProps = { ...getElementBox(el, ratioPx2Inch), colW: (el.colWidths || []).map((item) => (numberOr(el.width, 0) * item) / ratioPx2Inch) };
  if (el.theme) tableOptions.fill = { color: 'FFFFFF' };
  const border = getOutlineOption(el.outline, ratioPx2Pt);
  if (border) tableOptions.border = { type: border.dashType === 'solid' ? 'solid' : 'dash', pt: border.width, color: border.color };
  slide.addTable(tableData, tableOptions);
}

function stripUnsupportedMathML(mathml: string): string {
  return mathml.replace(/<mpadded[^>]*>/g, '').replace(/<\/mpadded>/g, '');
}

function latexToOmml(latex: string, fontSize?: number): string | null {
  try {
    let omml = String(mml2omml(stripUnsupportedMathML(temml.renderToString(latex))));
    const szAttr = fontSize ? ` sz="${Math.round(fontSize * 100)}"` : '';
    const rpr = `<a:rPr lang="en-US" i="1"${szAttr}><a:latin typeface="Cambria Math"/><a:cs typeface="Cambria Math"/></a:rPr>`;
    omml = omml.replace(/ xmlns:w="[^"]*"/g, '').replace(/ xmlns:m="[^"]*"/g, '');
    omml = omml.replace(/<m:r>(\s*)<m:t/g, `<m:r>$1${rpr}$1<m:t`);
    omml = omml.replace(/<m:ctrlPr\/>/g, `<m:ctrlPr>${rpr}</m:ctrlPr>`);
    return omml;
  } catch {
    return null;
  }
}

function addLatexElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number, ratioPx2Pt: number, slides: OpenMaicCanvasSlide[]) {
  const lineBreaks = typeof el.latex === 'string' ? (el.latex.match(/\\/g) || []).length : 0;
  const fontSize = Math.round(toPoint(el.height, ratioPx2Pt, 60) / ((lineBreaks + 1) * 3));
  const omml = el.latex ? latexToOmml(el.latex, fontSize) : null;
  const slideWithFormula = slide as pptxgen.Slide & { addFormula?: (options: Record<string, unknown>) => pptxgen.Slide };
  if (omml && typeof slideWithFormula.addFormula === 'function') {
    const align = el.align === 'left' || el.align === 'right' || el.align === 'center' ? el.align : undefined;
    slideWithFormula.addFormula({ omml, ...getElementBox(el, ratioPx2Inch), fontSize, align });
    return;
  }
  const path = el.path || `M0,${numberOr(el.height, 60) / 2} L${numberOr(el.width, 220)},${numberOr(el.height, 60) / 2}`;
  const range = getSvgPathRange(path);
  const sw = numberOr(el.strokeWidth, 0);
  const label = el.latex ? `<text x="8" y="24" font-family="Cambria Math, Microsoft YaHei" font-size="22" fill="${el.color || '#000000'}">${decodeHtml(el.latex).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char))}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${numberOr(el.width, 1)}" height="${numberOr(el.height, 1)}" viewBox="${range.minX - sw} ${range.minY - sw} ${Math.max(range.maxX - range.minX + sw * 2, numberOr(el.width, 1))} ${Math.max(range.maxY - range.minY + sw * 2, numberOr(el.height, 1))}" stroke="${el.color || '#000000'}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round">${label}<path d="${path.replace(/"/g, '&quot;')}"/></svg>`;
  const link = getLinkOption(el.link, slides);
  slide.addImage({ data: svgBase64(svg), ...(baseOptions(el, ratioPx2Inch, ratioPx2Pt) as pptxgen.ImageProps), ...(link ? { hyperlink: link } : {}) });
}

async function addMediaElement(slide: pptxgen.Slide, el: OpenMaicCanvasElement, ratioPx2Inch: number) {
  const src = typeof el.src === 'string' ? el.src : '';
  if (!src) return;
  const mediaType: pptxgen.MediaType = el.type === 'audio' ? 'audio' : 'video';
  const data = await fetchAsDataUrl(src);
  const cover = typeof el.poster === 'string' ? await fetchAsDataUrl(el.poster) : null;
  const options: pptxgen.MediaProps = {
    type: mediaType,
    ...(data?.startsWith('data:') ? { data } : { path: src }),
    ...getElementBox(el, ratioPx2Inch),
    ...(cover?.startsWith('data:') ? { cover } : {}),
  } as pptxgen.MediaProps;
  slide.addMedia(options);
}

function addBackground(slide: pptxgen.Slide, canvas: NonNullable<OpenMaicCanvasSlide['canvas']>) {
  const bg = canvas.background;
  if (typeof bg === 'string') {
    const color = formatColor(bg);
    slide.background = { color: color.color, transparency: transparency(color) };
    return;
  }
  if (!bg || typeof bg !== 'object') {
    slide.background = { color: 'FFF7E8' };
    return;
  }
  const record = bg as Record<string, unknown>;
  if (record.type === 'solid') {
    const color = formatColor(record.color);
    slide.background = { color: color.color, transparency: transparency(color) };
  } else if (record.type === 'image' && record.image && typeof record.image === 'object') {
    const src = (record.image as { src?: unknown }).src;
    if (typeof src === 'string' && src) {
      if (isSVGImage(src) || isBase64Image(src)) slide.background = { data: src };
      else slide.background = { path: src };
    }
  } else if (record.type === 'gradient' && record.gradient && typeof record.gradient === 'object') {
    const colors = (record.gradient as { colors?: Array<{ color?: string }> }).colors || [];
    const first = colors[0]?.color || '#FFF7E8';
    const last = colors[colors.length - 1]?.color || first;
    slide.background = { color: formatColor(tinycolor.mix(first, last).toHexString()).color };
  } else {
    slide.background = { color: 'FFF7E8' };
  }
}

function buildSpeakerNotes(actions: OpenMaicCanvasSlide['actions']): string {
  if (!Array.isArray(actions)) return '';
  return actions.map((action) => action?.type === 'speech' && typeof action.text === 'string' ? action.text : '').filter(Boolean).join('\n');
}

export async function createOpenMaicPptx(slides: OpenMaicCanvasSlide[], title = '课程课件'): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.author = 'OpenMAIC Course Platform';
  pptx.subject = title;
  pptx.title = title;
  pptx.company = 'OpenMAIC';
  pptx.layout = 'LAYOUT_16x9';
  pptx.theme = { headFontFace: DEFAULT_FONT_FAMILY, bodyFontFace: DEFAULT_FONT_FAMILY };

  const firstCanvas = slides[0]?.canvas || {};
  const firstRatio = numberOr(firstCanvas.height, DEFAULT_CANVAS_HEIGHT) / numberOr(firstCanvas.width, DEFAULT_CANVAS_WIDTH);
  if (Math.abs(firstRatio - 0.75) < 0.02) pptx.layout = 'LAYOUT_4x3';
  else if (Math.abs(firstRatio - 0.625) < 0.02) pptx.layout = 'LAYOUT_16x10';

  for (const slideInput of slides) {
    const canvas = slideInput.canvas || {};
    const canvasWidth = numberOr(canvas.width, DEFAULT_CANVAS_WIDTH);
    const ratioPx2Inch = canvasWidth / 10;
    const ratioPx2Pt = ratioPx2Inch / 72;
    const slide = pptx.addSlide();
    addBackground(slide, canvas);
    const notes = buildSpeakerNotes(slideInput.actions);
    if (notes) slide.addNotes(notes);
    const elements = Array.isArray(canvas.elements) ? canvas.elements : [];
    for (const el of elements) {
      if (el.type === 'text') addTextElement(slide, el, ratioPx2Inch, ratioPx2Pt);
      else if (el.type === 'image') await addImageElement(slide, el, ratioPx2Inch, ratioPx2Pt, slides);
      else if (el.type === 'shape') await addShapeElement(slide, el, ratioPx2Inch, ratioPx2Pt, slides);
      else if (el.type === 'line') addLineElement(slide, el, ratioPx2Inch, ratioPx2Pt);
      else if (el.type === 'chart') addChartElement(slide, el, ratioPx2Inch, ratioPx2Pt);
      else if (el.type === 'table') addTableElement(slide, el, ratioPx2Inch, ratioPx2Pt);
      else if (el.type === 'latex') addLatexElement(slide, el, ratioPx2Inch, ratioPx2Pt, slides);
      else if (el.type === 'video' || el.type === 'audio') await addMediaElement(slide, el, ratioPx2Inch);
    }
    if (!elements.length && slideInput.title) {
      slide.addText(slideInput.title, { x: 0.8, y: 0.8, w: 8.4, h: 1, fontFace: DEFAULT_FONT_FAMILY, fontSize: 28, bold: true, color: '8F2017' });
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
}
