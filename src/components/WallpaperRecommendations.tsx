import { Sparkles } from 'lucide-react';
import type { WallpaperItem } from '../types/wallpaper';
import { WallpaperCard } from './WallpaperCard';
import { useLanguage } from '../i18n/LanguageContext';

export function WallpaperRecommendations({ wallpapers, onSelectWallpaper }: { wallpapers: WallpaperItem[]; onSelectWallpaper?: (wallpaper: WallpaperItem) => void }) {
  const { t } = useLanguage();
  return (<>
      {wallpapers.length > 0 && (
        <section
          aria-label={t('recommended')}
          className="pt-8 border-t border-zinc-800/80 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" aria-hidden="true" />
                <span>{t('youMayLike')}</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                {t('recommendationDescription')}
              </p>
            </div>
            <span className="text-xs text-zinc-500 font-mono px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
              {t('recommendationCount', { count: wallpapers.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
            {wallpapers.map((rec) => (
              <WallpaperCard
                key={rec.id}
                wallpaper={rec}
                onSelect={onSelectWallpaper}
              />
            ))}
          </div>
        </section>
      )}
  </>);
}
