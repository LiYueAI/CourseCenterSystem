import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getDirectusAuthHeaders } from '@/lib/directus-admin';

export const dynamic = 'force-dynamic';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://127.0.0.1:8055';
const DIRECTUS_UPLOADS_DIR =
  process.env.DIRECTUS_UPLOADS_DIR || '/opt/course-platform/directus/uploads';

type DirectusFileMeta = {
  id: string;
  storage?: string | null;
  filename_disk?: string | null;
  filename_download?: string | null;
  title?: string | null;
  type?: string | null;
  filesize?: string | number | null;
  modified_on?: string | null;
  uploaded_on?: string | null;
};

type DirectusFileResponse = {
  data?: DirectusFileMeta;
};

async function resolveExistingLocalFile(
  fileMeta: DirectusFileMeta
): Promise<{ fileMeta: DirectusFileMeta; filePath: string } | null> {
  const candidates: DirectusFileMeta[] = [fileMeta];

  if (fileMeta.filename_download || fileMeta.title) {
    const params: unknown[] = [fileMeta.id];
    const filters: string[] = [];

    if (fileMeta.type) {
      params.push(fileMeta.type);
      filters.push(`type = $${params.length}`);
    }

    if (fileMeta.filename_download) {
      params.push(fileMeta.filename_download);
      filters.push(`filename_download = $${params.length}`);
    }

    if (fileMeta.title) {
      params.push(fileMeta.title);
      filters.push(`title = $${params.length}`);
    }

    if (filters.length > 0) {
      const alternates = await query<DirectusFileMeta>(
        `select id, storage, filename_disk, filename_download, title, type, filesize, modified_on, uploaded_on
         from directus_files
         where storage = 'local'
           and id <> $1
           and (${filters.join(' or ')})
         order by created_on asc, id asc`,
        params
      );
      candidates.push(...alternates);
    }
  }

  for (const candidate of candidates) {
    if (candidate.storage !== 'local' || !candidate.filename_disk) {
      continue;
    }

    const filePath = path.join(DIRECTUS_UPLOADS_DIR, path.basename(candidate.filename_disk));

    try {
      await access(filePath);
      return { fileMeta: candidate, filePath };
    } catch {}
  }

  return null;
}

function buildDisposition(filename?: string | null): string {
  const fallback = (filename || 'file').replace(/["\r\n]/g, '_');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename || fallback)}`;
}

function buildWeakEtag(fileSize: number, modifiedAtMs: number): string {
  return `W/"${fileSize}-${Math.floor(modifiedAtMs)}"`;
}

function parseRangeHeader(
  rangeHeader: string | null,
  fileSize: number
): { start: number; end: number } | null {
  if (!rangeHeader) {
    return null;
  }

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/i);
  if (!match) {
    return null;
  }

  const rawStart = match[1];
  const rawEnd = match[2];

  let start = rawStart ? Number(rawStart) : Number.NaN;
  let end = rawEnd ? Number(rawEnd) : Number.NaN;

  if (Number.isNaN(start) && Number.isNaN(end)) {
    return null;
  }

  if (Number.isNaN(start)) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    if (start < 0 || start >= fileSize) {
      return null;
    }
    if (Number.isNaN(end) || end >= fileSize) {
      end = fileSize - 1;
    }
  }

  if (end < start) {
    return null;
  }

  return { start, end };
}

async function getDirectusFileMeta(assetId: string): Promise<DirectusFileMeta | null> {
  const headers = await getDirectusAuthHeaders();
  const response = await fetch(`${DIRECTUS_URL}/files/${assetId}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as DirectusFileResponse;
  return payload.data || null;
}

async function serveLocalAsset(
  request: NextRequest,
  assetId: string
): Promise<Response | null> {
  const fileMeta = await getDirectusFileMeta(assetId);
  if (!fileMeta || fileMeta.storage !== 'local' || !fileMeta.filename_disk) {
    return null;
  }

  const resolvedLocalFile = await resolveExistingLocalFile(fileMeta);
  if (!resolvedLocalFile) {
    return null;
  }

  try {
    const fileStats = await stat(resolvedLocalFile.filePath);
    const range = parseRangeHeader(request.headers.get('range'), fileStats.size);

    if (request.headers.get('range') && !range) {
      return new Response(null, {
        status: 416,
        headers: new Headers({
          'accept-ranges': 'bytes',
          'cache-control': 'public, max-age=3600',
          'content-range': `bytes */${fileStats.size}`,
          etag: buildWeakEtag(fileStats.size, fileStats.mtimeMs),
        }),
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? fileStats.size - 1;
    const contentLength = end - start + 1;

    const headers = new Headers({
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=3600',
      'content-disposition': buildDisposition(
        resolvedLocalFile.fileMeta.filename_download ||
          resolvedLocalFile.fileMeta.title ||
          resolvedLocalFile.fileMeta.filename_disk
      ),
      'content-length': String(contentLength),
      'content-type': resolvedLocalFile.fileMeta.type || 'application/octet-stream',
      etag: buildWeakEtag(fileStats.size, fileStats.mtimeMs),
      'last-modified': fileStats.mtime.toUTCString(),
    });

    if (range) {
      headers.set('content-range', `bytes ${start}-${end}/${fileStats.size}`);
    }

    const body =
      request.method === 'HEAD'
        ? null
        : (Readable.toWeb(
            createReadStream(resolvedLocalFile.filePath, { start, end })
          ) as ReadableStream);

    return new Response(body, {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    return null;
  }
}

async function proxyAsset(request: NextRequest, assetId: string) {
  const upstreamUrl = new URL(`${DIRECTUS_URL}/assets/${assetId}`);
  const requestUrl = new URL(request.url);

  requestUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const headers = await getDirectusAuthHeaders();
  const range = request.headers.get('range');
  const ifNoneMatch = request.headers.get('if-none-match');
  const ifModifiedSince = request.headers.get('if-modified-since');

  if (range) {
    headers.set('Range', range);
  }
  if (ifNoneMatch) {
    headers.set('If-None-Match', ifNoneMatch);
  }
  if (ifModifiedSince) {
    headers.set('If-Modified-Since', ifModifiedSince);
  }

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    cache: 'no-store',
  });

  if (upstreamResponse.status === 403) {
    const localResponse = await serveLocalAsset(request, assetId);
    if (localResponse) {
      return localResponse;
    }
  }

  const responseHeaders = new Headers();
  const passthroughHeaders = [
    'accept-ranges',
    'cache-control',
    'content-disposition',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
  ];

  for (const headerName of passthroughHeaders) {
    const value = upstreamResponse.headers.get(headerName);
    if (value) {
      responseHeaders.set(headerName, value);
    }
  }

  if (!responseHeaders.has('cache-control')) {
    responseHeaders.set('cache-control', 'public, max-age=3600');
  }

  return new Response(request.method === 'HEAD' ? null : upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params;
  return proxyAsset(request, assetId);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await context.params;
  return proxyAsset(request, assetId);
}
