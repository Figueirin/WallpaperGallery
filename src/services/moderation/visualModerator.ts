/**
 * WallpaperGallery — Módulo de Moderação Visual de Imagens
 *
 * Avaliação local e segura de imagens de preview, com download controlado,
 * verificação de magic bytes, cálculo de hash SHA-256, cache em disco e
 * classificação configurável (safe, review, blocked) com proteção fail-closed.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import zlib from 'node:zlib';
import type { ModerationStatus, ModerationReason } from './types.ts';

export interface VisualScore {
  safe: number;
  nsfw: number;
  uncertainty: number;
  details?: {
    skinToneRatio?: number;
    sampleCount?: number;
    formatDetected?: string;
  };
}

export interface VisualClassificationResult {
  status: ModerationStatus;
  confidence: number;
  score: VisualScore;
  reasons: ModerationReason[];
  imageHash: string;
  source: 'cache' | 'analysis' | 'fallback_review';
}

export interface VisualModeratorOptions {
  cacheFilePath?: string;
  blockedThreshold?: number; // padrão 0.70
  reviewThreshold?: number;  // padrão 0.35
  maxDownloadBytes?: number; // padrão 10 MB
  downloadTimeoutMs?: number;// padrão 5000 ms
  fetchImpl?: typeof fetch;
  customClassifier?: (buffer: Buffer) => Promise<VisualScore>;
  trustedHosts?: string[];
  allowAnyHostForTesting?: boolean;
}

const DEFAULT_TRUSTED_HOSTS = [
  'images.steamusercontent.com',
  'steamcdn-a.akamaihd.net',
  'community.cloudflare.steamstatic.com',
  'steamuserimages-a.akamaihd.net',
  'localhost',
  '127.0.0.1',
];

/**
 * Valida o formato da imagem através de seus Magic Bytes
 */
export function detectImageMagicBytes(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'unknown' {
  if (buffer.length < 12) return 'unknown';

  // JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP: 'RIFF'....'WEBP'
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return 'unknown';
}

/**
 * Download seguro de imagem de preview com proteções estritas
 */
export async function safeDownloadImage(
  url: string,
  options: {
    maxBytes?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    trustedHosts?: string[];
    allowAnyHostForTesting?: boolean;
  } = {}
): Promise<{ buffer: Buffer; mimeType: string }> {
  const {
    maxBytes = 10 * 1024 * 1024,
    timeoutMs = 5000,
    fetchImpl = globalThis.fetch,
    trustedHosts = DEFAULT_TRUSTED_HOSTS,
    allowAnyHostForTesting = false,
  } = options;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('URL de imagem malformada ou inválida');
  }

  if (parsedUrl.protocol !== 'https:' && !allowAnyHostForTesting) {
    throw new Error(`Protocolo inseguro rejeitado para download: ${parsedUrl.protocol}`);
  }

  if (
    !allowAnyHostForTesting &&
    !trustedHosts.some((h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`))
  ) {
    throw new Error(`Host não confiável para download de imagem: ${parsedUrl.hostname}`);
  }

  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'image/jpeg,image/png,image/webp,*/*' },
  });

  if (!response.ok) {
    throw new Error(`Falha HTTP ao baixar imagem: status ${response.status}`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredSize = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(declaredSize) && declaredSize > maxBytes) {
      throw new Error(`Tamanho da imagem (${declaredSize} bytes) excede o limite seguro de ${maxBytes} bytes`);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > maxBytes) {
    throw new Error(`Tamanho recebido (${buffer.length} bytes) excedeu o limite máximo seguro`);
  }

  const detectedFormat = detectImageMagicBytes(buffer);
  if (detectedFormat === 'unknown') {
    throw new Error('Magic bytes da imagem não correspondem a formato suportado (JPEG, PNG ou WebP)');
  }

  return { buffer, mimeType: contentType || `image/${detectedFormat}` };
}

/**
 * Amostrador heurístico de tons de pele em espaço de cor YCbCr
 */
export function evaluateSkinToneHeuristic(buffer: Buffer): VisualScore {
  const format = detectImageMagicBytes(buffer);
  if (format === 'unknown') {
    return { safe: 0, nsfw: 0, uncertainty: 1 };
  }

  let skinPixels = 0;
  let totalSamples = 0;

  if (format === 'png') {
    try {
      // Extração de amostras dos chunks IDAT em PNG
      let offset = 8;
      const idatParts: Buffer[] = [];
      while (offset < buffer.length - 8) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'IDAT') {
          idatParts.push(buffer.subarray(offset + 8, offset + 8 + length));
        }
        offset += 12 + length;
      }
      if (idatParts.length > 0) {
        const decompressed = zlib.inflateSync(Buffer.concat(idatParts));
        // Amostra a cada N bytes
        const step = Math.max(4, Math.floor(decompressed.length / 2000) * 4);
        for (let i = 0; i < decompressed.length - 4; i += step) {
          const r = decompressed[i + 1];
          const g = decompressed[i + 2];
          const b = decompressed[i + 3];

          // Conversão para YCbCr
          const y = 0.299 * r + 0.587 * g + 0.114 * b;
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

          // Faixa de tons de pele humana/anime padrão
          if (y >= 60 && y <= 255 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
            skinPixels++;
          }
          totalSamples++;
        }
      }
    } catch {
      // Decompressão ou parsing parcial falhou
    }
  }

  // Se não foi possível extrair via PNG, realiza amostragem estatística de bytes brutos
  if (totalSamples === 0) {
    const step = Math.max(1, Math.floor(buffer.length / 1000));
    for (let i = 0; i < buffer.length; i += step) {
      const byte = buffer[i];
      if (byte > 180 && byte < 240) {
        skinPixels++;
      }
      totalSamples++;
    }
  }

  const ratio = totalSamples > 0 ? skinPixels / totalSamples : 0;

  // Se a proporção for muito alta (> 48%), há indicativo forte de nudez predominante
  if (ratio > 0.48) {
    return {
      safe: 0.15,
      nsfw: 0.85,
      uncertainty: 0.15,
      details: { skinToneRatio: ratio, sampleCount: totalSamples, formatDetected: format },
    };
  }

  // Faixa intermediária suspeita (35% a 48%)
  if (ratio > 0.35) {
    return {
      safe: 0.45,
      nsfw: 0.55,
      uncertainty: 0.40,
      details: { skinToneRatio: ratio, sampleCount: totalSamples, formatDetected: format },
    };
  }

  return {
    safe: 0.90,
    nsfw: 0.10,
    uncertainty: 0.05,
    details: { skinToneRatio: ratio, sampleCount: totalSamples, formatDetected: format },
  };
}

/**
 * Classe principal do Moderador Visual com cache persistente
 */
export class VisualModerator {
  private cacheFilePath: string;
  private cache: Map<string, VisualClassificationResult> = new Map();
  private blockedThreshold: number;
  private reviewThreshold: number;
  private maxDownloadBytes: number;
  private downloadTimeoutMs: number;
  private fetchImpl: typeof fetch;
  private customClassifier?: (buffer: Buffer) => Promise<VisualScore>;
  private trustedHosts: string[];
  private allowAnyHostForTesting: boolean;

  constructor(options: VisualModeratorOptions = {}) {
    this.cacheFilePath = resolve(options.cacheFilePath ?? '.moderation/visual_cache.json');
    this.blockedThreshold = options.blockedThreshold ?? 0.70;
    this.reviewThreshold = options.reviewThreshold ?? 0.35;
    this.maxDownloadBytes = options.maxDownloadBytes ?? 10 * 1024 * 1024;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 5000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.customClassifier = options.customClassifier;
    this.trustedHosts = options.trustedHosts ?? DEFAULT_TRUSTED_HOSTS;
    this.allowAnyHostForTesting = Boolean(options.allowAnyHostForTesting);

    this.loadCache();
  }

  private loadCache(): void {
    if (existsSync(this.cacheFilePath)) {
      try {
        const raw = readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.imageHash) {
              this.cache.set(item.imageHash, item);
            }
          }
        }
      } catch {
        // Cache corrompido é reinicializado de forma segura
        this.cache.clear();
      }
    }
  }

  public saveCache(): void {
    try {
      mkdirSync(dirname(this.cacheFilePath), { recursive: true });
      const entries = Array.from(this.cache.values());
      writeFileSync(this.cacheFilePath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch {
      // Não interrompe o pipeline se gravação do cache falhar
    }
  }

  /**
   * Avalia uma imagem via buffer pré-carregado
   */
  public async classifyBuffer(
    buffer: Buffer,
    _identifier = 'buffer'
  ): Promise<VisualClassificationResult> {
    const hash = createHash('sha256').update(buffer).digest('hex');

    if (this.cache.has(hash)) {
      const cached = this.cache.get(hash)!;
      return { ...cached, source: 'cache' };
    }

    try {
      let score: VisualScore;
      if (this.customClassifier) {
        score = await this.customClassifier(buffer);
      } else {
        score = evaluateSkinToneHeuristic(buffer);
      }

      const reasons: ModerationReason[] = [];
      let status: ModerationStatus = 'safe';

      if (score.nsfw >= this.blockedThreshold) {
        status = 'blocked';
        reasons.push({
          category: 'visual_analysis',
          triggerField: 'preview_image',
          confidence: score.nsfw,
          message: `Probabilidade elevada de nudez ou conteúdo adulto na imagem (${Math.round(score.nsfw * 100)}%).`,
        });
      } else if (score.nsfw >= this.reviewThreshold || score.uncertainty >= 0.50) {
        status = 'review';
        reasons.push({
          category: 'visual_analysis',
          triggerField: 'preview_image',
          confidence: score.nsfw,
          message: 'Análise visual inconclusiva ou limítrofe, exigindo revisão humana.',
        });
      }

      const result: VisualClassificationResult = {
        status,
        confidence: status === 'safe' ? score.safe : score.nsfw,
        score,
        reasons,
        imageHash: hash,
        source: 'analysis',
      };

      this.cache.set(hash, result);
      return result;
    } catch (err) {
      // Regra de falha segura (Fail-Closed)
      return {
        status: 'review',
        confidence: 0,
        score: { safe: 0, nsfw: 0, uncertainty: 1 },
        reasons: [
          {
            category: 'visual_analysis',
            triggerField: 'preview_image',
            message: `Falha durante a inferência visual: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
          },
        ],
        imageHash: hash,
        source: 'fallback_review',
      };
    }
  }

  /**
   * Avalia uma imagem a partir de sua URL (com download seguro e fail-closed)
   */
  public async classifyImageUrl(
    url: string,
    itemId: string
  ): Promise<VisualClassificationResult> {
    const urlHash = createHash('sha256').update(`${itemId}:${url}`).digest('hex');

    if (this.cache.has(urlHash)) {
      return { ...this.cache.get(urlHash)!, source: 'cache' };
    }

    try {
      const { buffer } = await safeDownloadImage(url, {
        maxBytes: this.maxDownloadBytes,
        timeoutMs: this.downloadTimeoutMs,
        fetchImpl: this.fetchImpl,
        trustedHosts: this.trustedHosts,
        allowAnyHostForTesting: this.allowAnyHostForTesting,
      });

      const result = await this.classifyBuffer(buffer, itemId);
      this.cache.set(urlHash, result);
      return result;
    } catch (downloadErr) {
      // Proteção Fail-Closed: falha de download não pode autorizar publicação
      const result: VisualClassificationResult = {
        status: 'review',
        confidence: 0,
        score: { safe: 0, nsfw: 0, uncertainty: 1 },
        reasons: [
          {
            category: 'download_failure',
            triggerField: 'preview_image',
            message: `Falha de download da imagem de preview: ${downloadErr instanceof Error ? downloadErr.message : 'Erro desconhecido'}. Item retido para revisão.`,
          },
        ],
        imageHash: urlHash,
        source: 'fallback_review',
      };

      this.cache.set(urlHash, result);
      return result;
    }
  }
}
