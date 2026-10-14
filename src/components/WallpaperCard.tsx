import { useState } from 'react';
import { WallpaperItem } from '../types/wallpaper';
import {
  ExternalLink,
  Layers,
  Film,
  Globe,
  Tag,
  User,
  ImageOff,
  MonitorPlay,
} from 'lucide-react';

interface WallpaperCardProps {
  wallpaper: WallpaperItem;
}

export function WallpaperCard({ wallpaper }: WallpaperCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

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

  return (
    <article
      tabIndex={0}
      aria-label={`Wallpaper: ${wallpaper.title}`}
      className="group flex flex-col rounded-2xl bg-zinc-900/80 border border-zinc-800/80 overflow-hidden hover:border-zinc-700 hover:shadow-lg hover:shadow-black/40 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent"
    >
      {/* Área da Imagem de Prévia */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-950 flex items-center justify-center">
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

        {/* Badges superiores na imagem: Tipo e Resolução */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/80 backdrop-blur-md border border-white/10 text-[11px] font-medium text-zinc-200">
            {renderTypeIcon()}
            <span>{wallpaper.type}</span>
          </span>
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

