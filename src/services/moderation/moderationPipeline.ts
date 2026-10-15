/**
 * WallpaperGallery — Pipeline Unificado de Moderação de Conteúdo
 *
 * Combina moderação estrita de metadados (Steam Rating e Termos Restritos)
 * com moderação visual de imagens, garantindo que nenhum item impróprio
 * ou não analisado seja aprovado para publicação pública.
 */

import type { WallpaperItem } from '../../types/wallpaper.ts';
import type { ModerationDecision, ModerationStatus } from './types.ts';
import { moderateMetadata } from './metadataModerator.ts';
import { VisualModerator, type VisualModeratorOptions } from './visualModerator.ts';

export interface ModerationPipelineOptions {
  visualOptions?: VisualModeratorOptions;
  skipVisualAnalysis?: boolean; // Para ambientes onde apenas metadados devem ser avaliados
}

export class ModerationPipeline {
  private visualModerator: VisualModerator;
  private skipVisualAnalysis: boolean;

  constructor(options: ModerationPipelineOptions = {}) {
    this.visualModerator = new VisualModerator(options.visualOptions);
    this.skipVisualAnalysis = Boolean(options.skipVisualAnalysis);
  }

  /**
   * Avalia um wallpaper individual através de todas as camadas de proteção.
   */
  public async evaluateItem(item: WallpaperItem): Promise<ModerationDecision> {
    // 1. Camada de Metadados (rápida, sem consumo de rede)
    const metaDecision = moderateMetadata(item);

    // Se os metadados já reprovarem o item (ex: Steam Mature ou tag NSFW),
    // o bloqueio é imediato sem necessidade de baixar a imagem.
    if (metaDecision.status === 'blocked') {
      return metaDecision;
    }

    // Se a análise visual for dispensada por opção
    if (this.skipVisualAnalysis) {
      return metaDecision;
    }

    // 2. Camada Visual
    if (!item.previewUrl) {
      return {
        id: item.id,
        status: 'review',
        reasons: [
          {
            category: 'format_validation',
            triggerField: 'preview_image',
            message: 'Wallpaper sem URL de preview válida para inspeção visual.',
          },
        ],
        timestamp: new Date().toISOString(),
      };
    }

    const visualResult = await this.visualModerator.classifyImageUrl(item.previewUrl, item.id);

    // Combina decisões
    const combinedReasons = [...metaDecision.reasons, ...visualResult.reasons];
    let finalStatus: ModerationStatus = metaDecision.status;

    if (visualResult.status === 'blocked') {
      finalStatus = 'blocked';
    } else if (visualResult.status === 'review') {
      finalStatus = 'review';
    }

    return {
      id: item.id,
      status: finalStatus,
      reasons: combinedReasons,
      timestamp: new Date().toISOString(),
      metadataMatches: metaDecision.metadataMatches,
      visualScore: visualResult.score,
    };
  }

  /**
   * Salva o cache visual em disco
   */
  public saveVisualCache(): void {
    this.visualModerator.saveCache();
  }
}
