import { useLanguage } from '../i18n/LanguageContext';
import { Heart, ExternalLink } from 'lucide-react';

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="w-full border-t border-zinc-850 mt-16 py-8 text-xs text-zinc-500 bg-zinc-950">
      <div className="max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col items-center sm:items-start gap-1 text-center sm:text-left">
          <p className="text-zinc-400">
            <span className="font-semibold text-zinc-300">WallpaperGallery</span> — {t('footerDescription')}
          </p>
          <p className="text-zinc-500 text-[11px]">
            {t('independent')}
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0 text-zinc-400">
          <span className="inline-flex items-center gap-1">
            {t('madeFor')} <Heart className="w-3 h-3 text-rose-500 fill-rose-500" aria-hidden="true" />
          </span>
          <span>•</span>
          <a
            href="https://github.com/Figueirin/WallpaperGallery"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-200 inline-flex items-center gap-1 transition-colors"
          >
            GitHub <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}

