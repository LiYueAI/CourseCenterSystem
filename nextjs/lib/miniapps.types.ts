export type MiniAppSourceType = 'local' | 'external';
export type MiniAppStatus = 'draft' | 'published' | 'disabled';
export type MiniAppLaunchMode = 'iframe';
export type MiniAppMountOwnerKind = 'standard_module_item' | 'teacher_resource';

export interface MiniAppVersionSummary {
  id: number;
  miniAppId: number;
  version: string;
  entryUrl: string;
  sourceType: MiniAppSourceType;
  manifest: Record<string, unknown>;
  releaseNotes: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MiniAppSummary {
  id: number;
  appKey: string;
  name: string;
  description: string;
  iconUrl: string | null;
  coverUrl: string | null;
  category: string | null;
  vendorName: string | null;
  sourceType: MiniAppSourceType;
  status: MiniAppStatus;
  publishedVersionId: number | null;
  createdAt: string;
  updatedAt: string;
  versions: MiniAppVersionSummary[];
}

export interface MiniAppMountSummary {
  id: number;
  ownerKind: MiniAppMountOwnerKind;
  ownerId: number;
  miniAppId: number;
  miniAppVersionId: number | null;
  launchMode: MiniAppLaunchMode;
  mountStatus: 'active' | 'disabled';
  titleOverride: string | null;
  coverUrl: string | null;
  aspectRatio: string | null;
  params: Record<string, unknown>;
  miniApp: Pick<
    MiniAppSummary,
    | 'id'
    | 'appKey'
    | 'name'
    | 'description'
    | 'iconUrl'
    | 'coverUrl'
    | 'category'
    | 'vendorName'
    | 'sourceType'
    | 'status'
    | 'publishedVersionId'
  >;
  version: MiniAppVersionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface MiniAppLaunchPayload {
  mount: MiniAppMountSummary;
  entryUrl: string;
  launchUrl: string;
  token: string;
  expiresAt: string;
  origin: string;
}
