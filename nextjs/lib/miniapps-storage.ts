import 'server-only';

import { execFile } from 'child_process';
import { access, chmod, mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MINIAPPS_ROOT = process.env.MINIAPPS_ROOT || '/data/miniapps';
const MINIAPPS_PUBLIC_BASE = process.env.MINIAPPS_PUBLIC_BASE || '/miniapps';

function encodePathSegments(value: string): string {
  return value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function normalizeVersionSegment(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('版本号不能为空');
  }
  if (normalized === '.' || normalized === '..' || /[\\/\0-\x1f\x7f]/.test(normalized)) {
    throw new Error('版本号包含非法路径字符');
  }

  return normalized;
}

function normalizeEntryFile(value: string | null | undefined): string {
  const normalized = (value || 'index.html').trim().replace(/\\/g, '/');
  if (!normalized) {
    return 'index.html';
  }

  const resolved = path.posix.normalize(normalized);
  if (
    resolved.startsWith('/') ||
    resolved === '.' ||
    resolved === '..' ||
    resolved.split('/').some((segment) => segment === '..')
  ) {
    throw new Error('入口文件路径非法');
  }

  return resolved;
}

function assertZipEntriesSafe(entries: string[]) {
  if (entries.length === 0) {
    throw new Error('压缩包为空');
  }

  let hasFile = false;

  for (const entry of entries) {
    const normalized = entry.trim().replace(/\\/g, '/');
    if (!normalized) {
      continue;
    }
    if (normalized.startsWith('/') || normalized.split('/').some((segment) => segment === '..')) {
      throw new Error('压缩包包含非法路径');
    }
    if (!normalized.endsWith('/')) {
      hasFile = true;
    }
  }

  if (!hasFile) {
    throw new Error('压缩包内没有可发布文件');
  }
}

async function ensureFileExists(filePath: string) {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('压缩包中未找到入口文件');
    }
    throw error;
  }

  if (!fileStat.isFile()) {
    throw new Error('入口文件不是有效文件');
  }
}

async function ensureWorldReadable(targetPath: string): Promise<void> {
  const targetStat = await stat(targetPath);

  if (targetStat.isDirectory()) {
    await chmod(targetPath, 0o755);
    const entries = await readdir(targetPath);
    await Promise.all(
      entries.map((entry) => ensureWorldReadable(path.join(targetPath, entry)))
    );
    return;
  }

  if (targetStat.isFile()) {
    await chmod(targetPath, 0o644);
  }
}

export function buildMiniAppEntryUrl(appKey: string, version: string, entryFile?: string | null): string {
  const normalizedVersion = normalizeVersionSegment(version);
  const normalizedEntryFile = normalizeEntryFile(entryFile);

  return `${MINIAPPS_PUBLIC_BASE}/${encodeURIComponent(appKey)}/${encodeURIComponent(normalizedVersion)}/${encodePathSegments(normalizedEntryFile)}`;
}

export async function publishMiniAppZip(input: {
  appKey: string;
  version: string;
  zipBuffer: Buffer;
  entryFile?: string | null;
  overwrite?: boolean;
}): Promise<{ entryUrl: string; targetDir: string }> {
  const normalizedVersion = normalizeVersionSegment(input.version);
  const normalizedEntryFile = normalizeEntryFile(input.entryFile);
  const appDir = path.join(MINIAPPS_ROOT, input.appKey);
  const targetDir = path.join(appDir, normalizedVersion);
  const tempRootPrefix = path.join(appDir, '.upload-');
  let tempRoot = '';

  await mkdir(appDir, { recursive: true });

  if (!input.overwrite) {
    try {
      await access(targetDir);
      throw new Error('该版本的静态资源目录已存在');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  try {
    tempRoot = await mkdtemp(tempRootPrefix);
    const archivePath = path.join(tempRoot, 'bundle.zip');
    const extractedDir = path.join(tempRoot, 'bundle');

    await writeFile(archivePath, input.zipBuffer);

    const { stdout } = await execFileAsync('unzip', ['-Z1', archivePath]);
    const entries = stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    assertZipEntriesSafe(entries);

    await mkdir(extractedDir, { recursive: true });
    await execFileAsync('unzip', ['-qq', archivePath, '-d', extractedDir]);
    await ensureFileExists(path.join(extractedDir, normalizedEntryFile));

    if (input.overwrite) {
      await rm(targetDir, { recursive: true, force: true });
    }

    await rename(extractedDir, targetDir);
    await ensureWorldReadable(targetDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : '压缩包发布失败';
    throw new Error(message);
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    entryUrl: buildMiniAppEntryUrl(input.appKey, normalizedVersion, normalizedEntryFile),
    targetDir,
  };
}

export async function removeMiniAppPublishedFiles(appKey: string): Promise<void> {
  const normalizedAppKey = appKey.trim();
  if (!normalizedAppKey) {
    throw new Error('小游戏标识不能为空');
  }

  const targetDir = path.join(MINIAPPS_ROOT, normalizedAppKey);
  await rm(targetDir, { recursive: true, force: true });
}
