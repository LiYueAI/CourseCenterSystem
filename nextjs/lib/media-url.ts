const DIRECTUS_ASSET_PATH_PATTERN = /(?:https?:\/\/[^/]+)?\/(?:directus\/)?assets\/([^/?#]+)/i;
const APP_ASSET_PATH_PATTERN = /(?:https?:\/\/[^/]+)?\/media\/assets\/([^/?#]+)/i;

export function extractAssetId(fileUrl?: string | null): string | null {
  if (!fileUrl) {
    return null;
  }

  const appMatch = fileUrl.match(APP_ASSET_PATH_PATTERN);
  if (appMatch?.[1]) {
    return appMatch[1];
  }

  const directusMatch = fileUrl.match(DIRECTUS_ASSET_PATH_PATTERN);
  if (directusMatch?.[1]) {
    return directusMatch[1];
  }

  return null;
}

export function buildAppAssetUrl(assetId: string): string {
  return `/media/assets/${assetId}`;
}

export function resolveAssetUrl(fileUrl?: string | null): string {
  if (!fileUrl) {
    return '';
  }

  if (APP_ASSET_PATH_PATTERN.test(fileUrl)) {
    return fileUrl;
  }

  const assetId = extractAssetId(fileUrl);
  if (!assetId) {
    return fileUrl;
  }

  const searchIndex = fileUrl.indexOf('?');
  const search = searchIndex >= 0 ? fileUrl.slice(searchIndex) : '';

  return `${buildAppAssetUrl(assetId)}${search}`;
}
