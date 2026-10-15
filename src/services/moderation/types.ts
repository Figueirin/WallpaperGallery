/**
 * WallpaperGallery — Tipos do Sistema de Moderação de Conteúdo
 */

export type ModerationStatus = 'safe' | 'review' | 'blocked';

export type ModerationCategory =
  | 'steam_rating'
  | 'metadata_keyword'
  | 'visual_analysis'
  | 'download_failure'
  | 'format_validation'
  | 'manual_flag';

export interface ModerationReason {
  category: ModerationCategory;
  triggerField: 'steam_rating' | 'title' | 'description' | 'tags' | 'preview_image' | 'system';
  matchedTerm?: string;
  confidence?: number;
  message: string;
}

export interface ModerationDecision {
  id: string;
  status: ModerationStatus;
  reasons: ModerationReason[];
  timestamp: string;
  metadataMatches?: string[];
  visualScore?: {
    safe: number;
    nsfw: number;
    uncertainty?: number;
  };
}

export interface ModerationSummary {
  totalAnalyzed: number;
  approvedCount: number;
  blockedCount: number;
  reviewCount: number;
  blockedBySteamRating: number;
  blockedByMetadata: number;
  blockedByVisual: number;
  reviewByVisual: number;
  timestamp: string;
}
