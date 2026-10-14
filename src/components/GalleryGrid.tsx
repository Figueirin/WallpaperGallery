import { WallpaperItem } from '../types/wallpaper';
import { WallpaperCard } from './WallpaperCard';
import { EmptyState } from './EmptyState';

interface GalleryGridProps {
  wallpapers: WallpaperItem[];
  onResetSearch?: () => void;
  searchQuery?: string;
  onSelectWallpaper?: (wallpaper: WallpaperItem) => void;
}

export function GalleryGrid({
  wallpapers,
  onResetSearch,
  searchQuery,
  onSelectWallpaper,
}: GalleryGridProps) {
  if (wallpapers.length === 0) {
    return (
      <EmptyState
        type="empty"
        title="Nenhum wallpaper encontrado"
        description={
          searchQuery
            ? `Nenhum resultado corresponde à busca por "${searchQuery}". Tente usar outros termos.`
            : 'Nenhum wallpaper disponível no catálogo no momento.'
        }
        onReset={onResetSearch}
        resetLabel="Limpar busca"
      />
    );
  }

  return (
    <section
      aria-label="Galeria de wallpapers do Steam Workshop"
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[2100px]:grid-cols-6 gap-5 lg:gap-6"
    >
      {wallpapers.map((wallpaper) => (
        <WallpaperCard
          key={wallpaper.id}
          wallpaper={wallpaper}
          onSelect={onSelectWallpaper}
        />
      ))}
    </section>
  );
}

