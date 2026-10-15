import { useState, useRef, useEffect } from 'react';
import { WallpaperItem } from '../types/wallpaper';
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
  wallpaper,
  mode,
  isHovered = false,
  className = '',
  onVideoPlayChange,
}: WallpaperMediaProps) {
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
  }, [isHovered, mode, wallpaper.videoPreviewUrl, videoError, onVideoPlayChange]);

  const handleRetryVideo = () => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
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
              alt={`Pré-visualização do wallpaper ${wallpaper.title}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
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
            aria-label="Imagem de prévia indisponível"
          >
            <ImageOff className="w-8 h-8 mb-2 text-zinc-600" aria-hidden="true" />
            <span className="text-xs font-medium">Prévia indisponível</span>
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
          Seu navegador não suporta reprodução de vídeo HTML5.
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
            <span className="text-xs font-semibold">Falha na reprodução do vídeo</span>
          </div>
          <p className="text-xs text-zinc-400">
            Não foi possível carregar a transmissão do vídeo. Exibindo a imagem de capa em alta resolução.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleRetryVideo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Tentar novamente</span>
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
          title={`Demonstração no YouTube: ${wallpaper.title}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
            <span>Abrir em nova aba</span>
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setShowInteractiveWeb(false)}
            className="px-2.5 py-1 rounded-lg bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200"
          >
            Fechar Demo
          </button>
        </div>
        <iframe
          src={wallpaper.webDemoUrl}
          title={`Demonstração Web interativa: ${wallpaper.title}`}
          sandbox="allow-scripts allow-same-origin"
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
            alt={`Visualização ampliada do wallpaper ${wallpaper.title}`}
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
                <span>Testar Demo Web Interativa</span>
              </button>
            </div>
          )}
        </>
      ) : (
        <div
          className="flex flex-col items-center justify-center p-8 text-center text-zinc-500"
          role="img"
          aria-label="Mídia indisponível"
        >
          <ImageOff className="w-12 h-12 mb-3 text-zinc-600" aria-hidden="true" />
          <p className="text-sm font-medium">Prévia em alta resolução indisponível</p>
        </div>
      )}
    </div>
  );
}
