import { useLanguage } from '../i18n/LanguageContext';
import { useState, useRef, useEffect } from 'react';
import { WallpaperItem } from '../types/wallpaper';
import { safeMediaUrl, safeWebDemoUrl } from '../utils/safeUrls';
import { extractYouTubeVideoId } from '../utils/mediaFormats';
import {
  ImageOff,
  AlertCircle,
  RotateCcw,
  Monitor,
  ExternalLink,
} from 'lucide-react';

interface WallpaperMediaProps {
  wallpaper: WallpaperItem;
  mode: 'card' | 'detail';
  isHovered?: boolean;
  className?: string;
  onVideoPlayChange?: (isPlaying: boolean) => void;
}

export function WallpaperMedia({
  wallpaper: rawWallpaper,
  mode,
  isHovered = false,
  className = '',
  onVideoPlayChange,
}: WallpaperMediaProps) {
  const { t } = useLanguage();
  const wallpaper = { ...rawWallpaper,
    previewUrl: safeMediaUrl(rawWallpaper.previewUrl),
    videoPreviewUrl: safeMediaUrl(rawWallpaper.videoPreviewUrl),
    webDemoUrl: safeWebDemoUrl(rawWallpaper.webDemoUrl),
  };
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showInteractiveWeb, setShowInteractiveWeb] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const youtubeId = extractYouTubeVideoId(wallpaper.youtubePreviewUrl);

  // Efeito para controle seguro do hover no modo "card"
  useEffect(() => {
    if (mode !== 'card' || !wallpaper.videoPreviewUrl || videoError) {
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    let active = true;
    if (isHovered) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!prefersReducedMotion) {
        // Garantir que a propriedade muted do DOM seja explicitamente true
        // para contornar a Autoplay Policy do Chromium e WebKit
        videoEl.muted = true;

        if (videoEl.readyState >= 1) {
          videoEl.currentTime = 0;
        }

        const promise = videoEl.play();
        playPromiseRef.current = promise;

        if (promise !== undefined) {
          promise
            .then(() => {
              if (!active) return;
              setIsVideoPlaying(true);
              onVideoPlayChange?.(true);
            })
            .catch((err: Error) => {
              // AbortError acontece naturalmente se o mouse sair antes do play resolver
              if (err.name !== 'AbortError') {
                setIsVideoPlaying(false);
                onVideoPlayChange?.(false);
              }
            });
        }
      }
    } else {
      // Quando o cursor sai do card
      setIsVideoPlaying(false);
      onVideoPlayChange?.(false);

      if (playPromiseRef.current) {
        playPromiseRef.current
          .then(() => {
            videoEl.pause();
            if (videoEl.readyState >= 1) {
              videoEl.currentTime = 0;
            }
          })
          .catch(() => {
            // Ignorar rejeição prévia
            videoEl.pause();
          });
      } else {
        videoEl.pause();
      }
    }
    return () => { active = false; videoEl.pause(); };
  }, [isHovered, mode, wallpaper.videoPreviewUrl, videoError, onVideoPlayChange]);

  const handleRetryVideo = () => {
    setVideoError(false);
  };

  /* =========================================================================
   * MODO CARD (Grade da Galeria)
   * ========================================================================= */
  if (mode === 'card') {
    return (
      <div className={`relative w-full h-full overflow-hidden ${className}`}>
        {!imageError ? (
          <>
            {/* Shimmer/Placeholder enquanto a imagem está carregando */}
            {!imageLoaded && (
              <div
                className="absolute inset-0 bg-zinc-800/50 animate-pulse"
                aria-hidden="true"
              />
            )}
            <img
              src={wallpaper.previewUrl}
              alt={t('previewAlt', { title: wallpaper.title })}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Vídeo preview reproduzido sob hover se disponível */}
            {wallpaper.videoPreviewUrl && !videoError && (
              <video
                ref={videoRef}
                src={wallpaper.videoPreviewUrl}
                muted
                loop
                playsInline
                preload="none"
                onError={() => {
                  setVideoError(true);
                  setIsVideoPlaying(false);
                  onVideoPlayChange?.(false);
                }}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none ${
                  isHovered && isVideoPlaying ? 'opacity-100' : 'opacity-0'
                }`}
                aria-hidden="true"
              />
            )}
          </>
        ) : (
          /* Fallback visual caso a imagem falhe ao carregar */
          <div
            className="flex flex-col items-center justify-center p-4 text-center text-zinc-500 w-full h-full bg-zinc-950"
            role="img"
            aria-label={t('previewImageMissing')}
          >
            <ImageOff className="w-8 h-8 mb-2 text-zinc-600" aria-hidden="true" />
            <span className="text-xs font-medium">{t('previewMissing')}</span>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================================
   * MODO DETAIL (Página Dedicada de Detalhes)
   * ========================================================================= */

  // Cenário 1: Vídeo Direto (MP4 ou WebM)
  if (wallpaper.videoPreviewUrl && !videoError) {
    return (
      <div className={`relative w-full h-full bg-black flex items-center justify-center ${className}`}>
        <video
          ref={videoRef}
          src={wallpaper.videoPreviewUrl}
          controls
          playsInline
          preload="metadata"
          poster={wallpaper.previewUrl}
          onError={() => setVideoError(true)}
          className="w-full h-full object-contain"
        >
          {t('videoUnsupported')}
        </video>
      </div>
    );
  }

  // Cenário 2: Erro no player de vídeo com opção de fallback e retry
  if (wallpaper.videoPreviewUrl && videoError) {
    return (
      <div className="relative w-full h-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        {!imageError && (
          <img
            src={wallpaper.previewUrl}
            alt={wallpaper.title}
            className="absolute inset-0 w-full h-full object-contain opacity-25 filter blur-xs"
            aria-hidden="true"
          />
        )}
        <div className="relative z-10 max-w-md p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-center gap-2 text-amber-400">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
            <span className="text-xs font-semibold">{t('videoFailed')}</span>
          </div>
          <p className="text-xs text-zinc-400">
            {t('videoFailedDescription')}
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleRetryVideo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('retry')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Cenário 3: YouTube Trailer Embed (quando não há vídeo direto)
  if (youtubeId) {
    return (
      <div className={`relative w-full h-full bg-black flex items-center justify-center ${className}`}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=0&rel=0`}
          title={t('youtubeTitle', { title: wallpaper.title })}
          allow="encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  // Cenário 4: Web Wallpaper com demonstração interativa opcional
  if (wallpaper.webDemoUrl && showInteractiveWeb) {
    return (
      <div className={`relative w-full h-full bg-black flex flex-col ${className}`}>
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <a
            href={wallpaper.webDemoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200"
          >
            <span>{t('newTab')}</span>
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setShowInteractiveWeb(false)}
            className="px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200"
          >
            {t('closeDemo')}
          </button>
        </div>
        <iframe
          src={wallpaper.webDemoUrl}
          title={t('webTitle', { title: wallpaper.title })}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="w-full h-full border-0"
        />
      </div>
    );
  }

  // Cenário 5: Imagem estática / GIF ou Fallback com botão para Demo Web
  return (
    <div className={`relative w-full h-full bg-zinc-950 flex items-center justify-center ${className}`}>
      {!imageError ? (
        <>
          <img
            src={wallpaper.previewUrl}
            alt={t('largePreviewAlt', { title: wallpaper.title })}
            onError={() => setImageError(true)}
            className="w-full h-full object-contain bg-zinc-950"
          />

          {/* Botão para ativar demonstração interativa se for um Web Wallpaper */}
          {wallpaper.webDemoUrl && !showInteractiveWeb && (
            <div className="absolute bottom-4 right-4 z-10">
              <button
                type="button"
                onClick={() => setShowInteractiveWeb(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600/90 hover:bg-cyan-500 text-white font-medium text-xs shadow-lg backdrop-blur-sm transition-colors"
              >
                <Monitor className="w-4 h-4" aria-hidden="true" />
                <span>{t('tryWeb')}</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          className="flex flex-col items-center justify-center p-8 text-center text-zinc-500"
          role="img"
          aria-label={t('mediaMissing')}
        >
          <ImageOff className="w-12 h-12 mb-3 text-zinc-600" aria-hidden="true" />
          <p className="text-sm font-medium">{t('largePreviewMissing')}</p>
        </div>
      )}
    </div>
  );
}
