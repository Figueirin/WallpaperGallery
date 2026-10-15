/**
 * WallpaperGallery — Pipeline Simplificado de Moderação de Conteúdo
 *
 * Executa moderação em 2 etapas sem custos de rede ou visão computacional:
 * 1. Blacklist manual configurada em config/blocked-wallpapers.json
 * 2. Moderação de metadados (Classificação etária oficial da Steam + Termos restritos)
 */

import type { WallpaperItem } from '../../types/wallpaper.ts';
import type { ModerationDecision } from './types.ts';
import { moderateMetadata } from './metadataModerator.ts';
import { loadManualBlacklist } from './blacklist.ts';

export interface ModerationPipelineOptions {
  blacklistPath?: string;
  manualBlacklist?: Set<string>;
}

export class ModerationPipeline {
  private manualBlacklist: Set<string>;

  constructor(options: ModerationPipelineOptions = {}) {
    if (options.manualBlacklist) {
      this.manualBlacklist = options.manualBlacklist;
    } else {
      this.manualBlacklist = loadManualBlacklist(options.blacklistPath);
    }
  }

  /**
   * Avalia um wallpaper individual através da blacklist manual e dos metadados.
   */
  public evaluateItem(item: WallpaperItem | Partial<WallpaperItem>): ModerationDecision {
    const itemId = String(item?.id ?? '').trim();

    // 1. Verificação da Blacklist Manual
    if (itemId && this.manualBlacklist.has(itemId)) {
      return {
        id: itemId,
        status: 'blocked',
        reasons: [
          {
            category: 'manual_blacklist',
            triggerField: 'system',
            matchedTerm: itemId,
            message: `Wallpaper #${itemId} está bloqueado manualmente via blacklist (config/blocked-wallpapers.json).`,
          },
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Moderação de Metadados (Classificação Steam + Tags + Título + Descrição)
    return moderateMetadata(item as WallpaperItem);
  }
}
