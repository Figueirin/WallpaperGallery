/**
 * WallpaperGallery — Tipos do Sistema Simplificado de Moderação de Conteúdo
 */

export type ModerationStatus = 'safe' | 'blocked';

export type ModerationCategory =
  | 'manual_blacklist'
  | 'steam_rating'
  | 'metadata_keyword'
  | 'invalid_metadata';

export interface ModerationReason {
  category: ModerationCategory;
  triggerField: 'steam_rating' | 'title' | 'description' | 'tags' | 'system';
  matchedTerm?: string;
  message: string;
}

export interface ModerationDecision {
  id: string;
  status: ModerationStatus;
  reasons: ModerationReason[];
  timestamp: string;
  metadataMatches?: string[];
}

export interface ModerationSummary {
  totalAnalyzed: number;
  approvedCount: number;
  blockedCount: number;
  blockedByBlacklist: number;
  blockedBySteamRating: number;
  blockedByMetadata: number;
  blockedByInvalidMetadata?: number;
  timestamp: string;
}
