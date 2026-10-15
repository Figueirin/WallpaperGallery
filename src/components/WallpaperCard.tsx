import { useState } from 'react';
import { WallpaperItem } from '../types/wallpaper';
import { WallpaperMedia } from './WallpaperMedia';
import {
  ExternalLink,
  Layers,
  Film,
  Globe,
  Tag,
  User,
  MonitorPlay,
  Play,
} from 'lucide-react';

interface WallpaperCardProps {
  wallpaper: WallpaperItem;
  onSelect?: (wallpaper: WallpaperItem) => void;
}

export function WallpaperCard({ wallpaper, onSelect }: WallpaperCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Ícone representativo do tipo de wallpaper do Wallpaper Engine
  const renderTypeIcon = () => {
    switch (wallpaper.type) {
      case 'Video':
        return <Film className="w-3 h-3" aria-hidden="true" />;
      case 'Web':
        return <Globe className="w-3 h-3" aria-hidden="true" />;
      case 'Scene':
      default:
        return <Layers className="w-3 h-3" aria-hidden="true" />;
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsVideoPlaying(false);
  };

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(wallpaper);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
      e.preventDefault();
      onSelect(wallpaper);
    }
  };

  return (
    <article
      tabIndex={0}
      role="button"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-label={`Visualizar detalhes do wallpaper: ${wallpaper.title}`}
      className="group relative flex flex-col rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 hover:shadow-2xl hover:shadow-black/70 transition-all duration-300 ease-out hover:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
    >
      {/* Área da Imagem de Prévia / Vídeo com ampliação de ~25% em destaque no hover */}
      <div className="relative aspect-video w-full rounded-t-2xl overflow-hidden bg-zinc-950 flex items-center justify-center transition-all duration-300 ease-out origin-bottom group-hover:scale-[1.25] group-hover:rounded-2xl group-hover:shadow-2xl group-hover:shadow-black/95 group-hover:ring-1 group-hover:ring-white/15 group-hover:z-40 motion-reduce:group-hover:scale-100">
        <WallpaperMedia
          wallpaper={wallpaper}
          mode="card"
          isHovered={isHovered}
          onVideoPlayChange={setIsVideoPlaying}
        />

        {/* Badges superiores na imagem: Tipo, Vídeo e Resolução */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/80 backdrop-blur-md border border-white/10 text-[11px] font-medium text-zinc-200">
            {renderTypeIcon()}
            <span>{wallpaper.type}</span>
          </span>

          {wallpaper.videoPreviewUrl && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md backdrop-blur-md border text-[10px] font-medium transition-colors ${
                isVideoPlaying
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                  : 'bg-indigo-950/80 border-indigo-500/30 text-indigo-300'
              }`}
              title={
                isVideoPlaying
                  ? 'Vídeo em reprodução'
                  : 'Este wallpaper possui prévia em vídeo'
              }
            >
              <Play
                className={`w-2.5 h-2.5 fill-current ${
                  isVideoPlaying ? 'animate-pulse' : ''
                }`}
                aria-hidden="true"
              />
              <span>{isVideoPlaying ? 'Reproduzindo' : 'Vídeo'}</span>
            </span>
          )}
        </div>

        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-zinc-950/80 backdrop-blur-md border border-white/10 text-[11px] font-mono text-zinc-300">
            {wallpaper.resolution}
          </span>
        </div>
      </div>

      {/* Conteúdo e Metadados do Card */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Título */}
          <h3
            title={wallpaper.title}
            className="text-sm font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors line-clamp-1"
          >
            {wallpaper.title}
          </h3>

          {/* Autor */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <User className="w-3 h-3 text-zinc-500" aria-hidden="true" />
            <span className="truncate">{wallpaper.author.name}</span>
          </div>

          {/* Descrição resumida */}
          <p className="mt-2 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
            {wallpaper.description}
          </p>

          {/* Lista de tags visuais */}
          {wallpaper.tags && wallpaper.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Tags do wallpaper">
              {wallpaper.tags.slice(0, 3).map((tag) => (
                <span
                  key={`${wallpaper.id}-tag-${tag}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700/60 font-medium"
                >
                  <Tag className="w-2.5 h-2.5 text-zinc-500" aria-hidden="true" />
                  {tag}
                </span>
              ))}
              {wallpaper.tags.length > 3 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] text-zinc-500 font-medium">
                  +{wallpaper.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Card com Ações */}
        <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
          {/* Proporção da tela */}
          <span className="text-[11px] text-zinc-500 font-mono">
            {wallpaper.aspectRatio}
          </span>

          <div className="flex items-center gap-2">
            {/* Deep link para cliente Steam no Linux */}
            {wallpaper.steamClientUri && (
              <a
                href={wallpaper.steamClientUri}
                onClick={(e) => e.stopPropagation()}
                title="Abrir diretamente no aplicativo Steam para Linux"
                aria-label={`Abrir ${wallpaper.title} no aplicativo Steam`}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            )}

            {/* Link oficial para a página web no Steam Workshop */}
            {wallpaper.steamUrl && (
              <a
                href={wallpaper.steamUrl}
                onClick={(e) => e.stopPropagation()}
                target="_blank"
                rel="noopener noreferrer"
                title="Visualizar página no Steam Workshop"
                aria-label={`Abrir ${wallpaper.title} no Steam Workshop`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <span>Steam</span>
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

