import { deflateRawSync } from 'zlib';

export type PptxSlideInput = {
  title: string;
  subtitle?: string;
  bullets?: string[];
};

export type PptxCanvasElement = {
  type?: string;
  content?: string;
  defaultColor?: string;
  fill?: string;
  color?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  rotate?: number;
  src?: string;
  text?: { content?: string; defaultColor?: string };
};

export type PptxCanvasSlideInput = {
  title?: string;
  canvas?: {
    width?: number;
    height?: number;
    background?: string;
    theme?: { backgroundColor?: string };
    elements?: PptxCanvasElement[];
  };
};

export type PptxExportInput = {
  title: string;
  subtitle?: string;
  slides: PptxSlideInput[];
  canvasSlides?: PptxCanvasSlideInput[];
};

type ZipEntry = {
  path: string;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  method: number;
  offset: number;
};

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function writeUInt16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function buildZip(files: Array<{ path: string; data: string | Buffer }>): Buffer {
  const now = dosDateTime();
  const entries: ZipEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const compressed = deflateRawSync(data, { level: 6 });
    const name = Buffer.from(file.path, 'utf8');
    const entry: ZipEntry = {
      path: file.path,
      data,
      compressed,
      crc: crc32(data),
      method: 8,
      offset,
    };
    entries.push(entry);

    const header = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(entry.method),
      writeUInt16(now.time),
      writeUInt16(now.date),
      writeUInt32(entry.crc),
      writeUInt32(compressed.length),
      writeUInt32(data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name,
    ]);
    localParts.push(header, compressed);
    offset += header.length + compressed.length;
  }

  const centralParts: Buffer[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.path, 'utf8');
    const central = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(entry.method),
      writeUInt16(now.time),
      writeUInt16(now.date),
      writeUInt32(entry.crc),
      writeUInt32(entry.compressed.length),
      writeUInt32(entry.data.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(entry.offset),
      name,
    ]);
    centralParts.push(central);
    centralSize += central.length;
  }

  const end = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(centralSize),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textShape(id: number, name: string, text: string, x: number, y: number, cx: number, cy: number, fontSize = 2800, bold = false): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="${fontSize}"${bold ? ' b="1"' : ''}/><a:t>${xml(text)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

function bulletShape(id: number, bullets: string[], x: number, y: number, cx: number, cy: number): string {
  const paragraphs = bullets.length > 0 ? bullets : ['暂无内容'];
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Bullets"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs.map((item) => `<a:p><a:pPr marL="342900" indent="-171450"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="zh-CN" sz="2200"/><a:t>${xml(item)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
}


function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeHexColor(value?: string): string {
  if (!value) return 'FFFFFF';
  const match = value.match(/#?([0-9a-fA-F]{6})/);
  return match ? match[1].toUpperCase() : 'FFFFFF';
}

function canvasToEmu(value: number | undefined, total: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round(((value || 0) / total) * target);
}

function canvasTextShape(id: number, el: PptxCanvasElement, canvasWidth: number, canvasHeight: number): string {
  const text = stripHtml(el.content || el.text?.content || '');
  if (!text) return '';
  const x = canvasToEmu(el.left, canvasWidth, 9144000);
  const y = canvasToEmu(el.top, canvasHeight, 5143500);
  const cx = Math.max(canvasToEmu(el.width, canvasWidth, 9144000), 100000);
  const cy = Math.max(canvasToEmu(el.height, canvasHeight, 5143500), 100000);
  const color = normalizeHexColor(el.defaultColor || el.text?.defaultColor || '#2E1F16');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="CanvasText"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${text.split(/\n+/).filter(Boolean).map((line) => `<a:p><a:r><a:rPr lang="zh-CN" sz="2000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xml(line)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`;
}

function canvasShape(id: number, el: PptxCanvasElement, canvasWidth: number, canvasHeight: number): string {
  const x = canvasToEmu(el.left, canvasWidth, 9144000);
  const y = canvasToEmu(el.top, canvasHeight, 5143500);
  const cx = Math.max(canvasToEmu(el.width, canvasWidth, 9144000), 100000);
  const cy = Math.max(canvasToEmu(el.height, canvasHeight, 5143500), 100000);
  const fill = normalizeHexColor(el.fill || '#F8EAD1');
  const text = stripHtml(el.text?.content || '');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="CanvasShape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D9C29B"/></a:solidFill></a:ln></p:spPr>${text ? `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1800"><a:solidFill><a:srgbClr val="${normalizeHexColor(el.text?.defaultColor || '#2E1F16')}"/></a:solidFill></a:rPr><a:t>${xml(text)}</a:t></a:r></a:p></p:txBody>` : ''}</p:sp>`;
}

function canvasImagePlaceholder(id: number, el: PptxCanvasElement, canvasWidth: number, canvasHeight: number): string {
  const label = el.src ? `图片：${el.src}` : '图片占位';
  return canvasShape(id, { ...el, fill: '#EFE3CC', text: { content: label, defaultColor: '#7A5A35' } }, canvasWidth, canvasHeight);
}

function canvasLine(id: number, el: PptxCanvasElement, canvasWidth: number, canvasHeight: number): string {
  const x = canvasToEmu(el.left, canvasWidth, 9144000);
  const y = canvasToEmu(el.top, canvasHeight, 5143500);
  const cx = Math.max(canvasToEmu(el.width, canvasWidth, 9144000), 100000);
  const color = normalizeHexColor(el.color || '#8F2017');
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="CanvasLine"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></p:spPr><p:style/></p:cxnSp>`;
}

function canvasSlideXml(slide: PptxCanvasSlideInput, index: number): string {
  const canvas = slide.canvas || {};
  const canvasWidth = canvas.width || 960;
  const canvasHeight = canvas.height || 540;
  const bg = normalizeHexColor(canvas.background || canvas.theme?.backgroundColor || '#FFF7E8');
  const elements = Array.isArray(canvas.elements) ? canvas.elements : [];
  const shapes = elements.map((el, offset) => {
    const id = offset + 2;
    if (el.type === 'text') return canvasTextShape(id, el, canvasWidth, canvasHeight);
    if (el.type === 'shape') return canvasShape(id, el, canvasWidth, canvasHeight);
    if (el.type === 'image') return canvasImagePlaceholder(id, el, canvasWidth, canvasHeight);
    if (el.type === 'line') return canvasLine(id, el, canvasWidth, canvasHeight);
    return '';
  }).join('');
  const fallback = shapes || textShape(2, 'Title', slide.title || `OpenMAIC Slide ${index}`, 685800, 457200, 7772400, 914400, 3200, true);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${fallback}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideXml(slide: PptxSlideInput, index: number): string {
  const title = slide.title || `第 ${index} 页`;
  const subtitle = slide.subtitle || '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFF7E8"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${textShape(2, 'Title', title, 685800, 457200, 7772400, 914400, 3600, true)}${subtitle ? textShape(3, 'Subtitle', subtitle, 685800, 1257300, 7772400, 457200, 1800) : ''}${bulletShape(4, slide.bullets || [], 914400, 1943100, 7315200, 4114800)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
}

function contentTypes(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides}</Types>`;
}

function presentationXml(slideCount: number): string {
  const slideIds = Array.from({ length: slideCount }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
}

function presentationRels(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}<Relationship Id="rId${slideCount + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`;
}

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Course Platform</Application><PresentationFormat>宽屏</PresentationFormat><Slides>1</Slides></Properties>`;
const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Course Platform</dc:creator><cp:lastModifiedBy>Course Platform</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`;
const slideMasterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;
const slideMasterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`;
const slideLayoutXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const slideLayoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`;
const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="CourseTheme"><a:themeElements><a:clrScheme name="Course"><a:dk1><a:srgbClr val="2E1F16"/></a:dk1><a:lt1><a:srgbClr val="FFF7E8"/></a:lt1><a:dk2><a:srgbClr val="4A2A1D"/></a:dk2><a:lt2><a:srgbClr val="F8EAD1"/></a:lt2><a:accent1><a:srgbClr val="8F2017"/></a:accent1><a:accent2><a:srgbClr val="C58D3E"/></a:accent2><a:accent3><a:srgbClr val="4E7A51"/></a:accent3><a:accent4><a:srgbClr val="2D5C88"/></a:accent4><a:accent5><a:srgbClr val="7B4B8F"/></a:accent5><a:accent6><a:srgbClr val="D1663B"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Course"><a:majorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:majorFont><a:minorFont><a:latin typeface="Microsoft YaHei"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme><a:fmtScheme name="Course"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

export function createPptx(input: PptxExportInput): Buffer {
  const canvasSlides = input.canvasSlides || [];
  const slides: PptxSlideInput[] = [
    {
      title: input.title || '课程课件',
      subtitle: input.subtitle || '由课程平台导出',
      bullets: [canvasSlides.length > 0 ? '本文件优先使用 OpenMAIC slide canvas 导出。' : '本文件为标准 .pptx，可在 PowerPoint / WPS 中打开编辑。'],
    },
    ...(canvasSlides.length > 0 ? [] : input.slides.length > 0 ? input.slides : [{ title: '暂无课件内容', bullets: ['请先在备课页装配课堂资源。'] }]),
  ];
  const allSlideCount = slides.length + canvasSlides.length;
  const files: Array<{ path: string; data: string | Buffer }> = [
    { path: '[Content_Types].xml', data: contentTypes(allSlideCount) },
    { path: '_rels/.rels', data: rootRels },
    { path: 'docProps/app.xml', data: appXml.replace('<Slides>1</Slides>', `<Slides>${allSlideCount}</Slides>`) },
    { path: 'docProps/core.xml', data: coreXml },
    { path: 'ppt/presentation.xml', data: presentationXml(allSlideCount) },
    { path: 'ppt/_rels/presentation.xml.rels', data: presentationRels(allSlideCount) },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: slideMasterXml },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: slideMasterRels },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: slideLayoutXml },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: slideLayoutRels },
    { path: 'ppt/theme/theme1.xml', data: themeXml },
  ];
  slides.forEach((slide, index) => {
    files.push({ path: `ppt/slides/slide${index + 1}.xml`, data: slideXml(slide, index + 1) });
    files.push({ path: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slideRels() });
  });
  canvasSlides.forEach((slide, index) => {
    const slideIndex = slides.length + index + 1;
    files.push({ path: `ppt/slides/slide${slideIndex}.xml`, data: canvasSlideXml(slide, slideIndex) });
    files.push({ path: `ppt/slides/_rels/slide${slideIndex}.xml.rels`, data: slideRels() });
  });
  return buildZip(files);
}
