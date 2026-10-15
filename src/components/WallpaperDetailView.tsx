import { useLanguage } from '../i18n/LanguageContext';
import { usePageMetadata } from '../utils/usePageMetadata';
import { AuthorName } from './AuthorName';
import { steamLinks } from '../utils/safeUrls';
import { useEffect, useState } from 'react';
import { WallpaperItem } from '../types/wallpaper';
import { IWallpaperDataProvider } from '../services/dataProvider';
import { getResolutionLabel } from '../utils/filterWallpapers';
import { getRecommendedWallpapers } from '../utils/recommendations';
import { WallpaperRecommendations } from './WallpaperRecommendations';
import { EmptyState } from './EmptyState';
import { WallpaperMedia } from './WallpaperMedia';
import {
  ArrowLeft,
  ExternalLink,
  Layers,
  Film,
  Globe,
  Tag,
  Calendar,
  Eye,
  Heart,
  ThumbsUp,
  Download,
  Clock,
  Sparkles,
} from 'lucide-react';

interface WallpaperDetailViewProps {
  wallpaperId: string;
  provider: IWallpaperDataProvider;
  onBack: () => void;
  onSelectWallpaper?: (wallpaper: WallpaperItem) => void;
}

export function WallpaperDetailView({
  wallpaperId,
  provider,
  onBack,
  onSelectWallpaper,
}: WallpaperDetailViewProps) {
  const { t, language } = useLanguage();
  const [wallpaper, setWallpaper] = useState<WallpaperItem | null>(null);
  const [recommendations, setRecommendations] = useState<WallpaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  usePageMetadata(wallpaper ? `${wallpaper.title} | WallpaperGallery` : t('siteTitle'), wallpaper ? (wallpaper.description.trim().replace(/\s+/g, ' ').slice(0, 180) || t('detailSeo', { title: wallpaper.title })) : t('siteDescription'));

  useEffect(() => {
    let isMounted = true;

    async function loadItem() {
      setLoading(true);
      setLoadError(false);
      setWallpaper(null);
      setRecommendations([]);
      try {
        const item = await provider.getWallpaperById(wallpaperId);
        if (isMounted) {
          setWallpaper(item);
          if (item) {
            const allItemsResult = await provider.getWallpapers({ pageSize: 48 });
            const recs = getRecommendedWallpapers(allItemsResult.items, item, 6);
            if (isMounted) {
              setRecommendations(recs);
            }
          } else {
            setRecommendations([]);
          }
        }
      } catch (err) {
        console.error('Falha ao carregar detalhes do wallpaper:', err);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadItem();

    return () => {
      isMounted = false;
    };
  }, [wallpaperId, provider]);

  // Atalho de teclado Escape para retornar à galeria
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  // Formatação de data em português
  const formatDate = (isoDate: string) => {
    try {
      if (!isoDate || !Number.isFinite(Date.parse(isoDate))) return t('notProvided');
      return new Date(isoDate).toLocaleDateString(language, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoDate;
    }
  };

  // Formatação de tamanho em MB
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const renderTypeIcon = (type: string) => {
    switch (type) {
      case 'Video':
        return <Film className="w-4 h-4" aria-hidden="true" />;
      case 'Web':
        return <Globe className="w-4 h-4" aria-hidden="true" />;
      case 'Scene':
      default:
        return <Layers className="w-4 h-4" aria-hidden="true" />;
    }
  };

  if (loading) {
    return (
      <section
        aria-label={t('loadingDetails')}
        className="max-w-6xl mx-auto py-8 animate-pulse space-y-6"
      >
        <div className="h-8 w-40 bg-zinc-800/60 rounded-xl" />
        <div className="aspect-video w-full bg-zinc-850/60 rounded-3xl" />
        <div className="h-10 w-2/3 bg-zinc-800/60 rounded-xl" />
        <div className="h-24 w-full bg-zinc-800/40 rounded-xl" />
      </section>
    );
  }

  if (!wallpaper) {
    return (
      <section aria-label={t('notFound')} className="py-12">
        <EmptyState
          type="error"
          title={t(loadError ? 'loadFailed' : 'notFound')}
          description={loadError ? t('loadErrorDescription') : t('itemNotFound', { id: wallpaperId })}
          onReset={onBack}
          resetLabel={t('backGallery')}
        />
      </section>
    );
  }

  return (
    <article
      key={wallpaper.id}
      aria-label={t('detailsTitle', { title: wallpaper.title })}
      className="max-w-6xl mx-auto py-4 sm:py-6 space-y-8 animate-detail-enter"
    >
      {/* Barra Superior de Navegação e Ações */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-700 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
          title={t('backGalleryEsc')}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t('backGalleryButton')}</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono ml-1">Esc</kbd>
        </button>

        {/* Links Externos para Steam */}
        <div className="flex items-center gap-2.5">


          {steamLinks(wallpaper.id, wallpaper.isSimulated).web && (
            <a
              href={steamLinks(wallpaper.id, wallpaper.isSimulated).web}
              target="_blank"
              rel="noopener noreferrer"
              title={t('steamPage')}
              aria-label={t('openSteamTitle', { title: wallpaper.title })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span>Steam Workshop</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {wallpaper.isSimulated && <p role="status" className="text-sm text-amber-300">{t('simulatedDetail')}</p>}

      {/* Área Principal de Mídia (Player de Vídeo, YouTube, Web Demo ou Imagem) */}
      <div className="relative aspect-video w-full rounded-3xl overflow-hidden bg-zinc-950 border border-zinc-800/80 shadow-2xl shadow-black/80 flex items-center justify-center animate-media-reveal">
        <WallpaperMedia
          key={wallpaper.id}
          wallpaper={wallpaper}
          mode="detail"
        />

        {/* Badges Superiores Flutuantes */}
        <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-950/85 backdrop-blur-md border border-white/10 text-xs font-medium text-zinc-200">
            {renderTypeIcon(wallpaper.type)}
            <span>{t(`type${wallpaper.type}`)}</span>
          </span>

          <span className="px-3 py-1 rounded-xl bg-zinc-950/85 backdrop-blur-md border border-white/10 text-xs font-mono text-zinc-200">
            {wallpaper.resolution} ({wallpaper.aspectRatio})
          </span>
        </div>
      </div>

      {/* Conteúdo e Metadados do Wallpaper */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-2">
        {/* Coluna Esquerda: Título, Autor, Descrição e Tags */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50">
              {wallpaper.title}
            </h1>

            <div className="mt-2.5 flex items-center gap-3 text-sm text-zinc-400">
              <AuthorName author={wallpaper.author} className="font-medium text-zinc-200" />
              <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" aria-hidden="true" />
                {formatDate(wallpaper.createdAt)}
              </span>
            </div>
          </div>

          {/* Descrição Detalhada */}
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {t('description')}
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line bg-zinc-900/40 p-4 rounded-2xl border border-zinc-800/60">
              {wallpaper.description}
            </p>
          </div>

          {/* Tags */}
          {wallpaper.tags && wallpaper.tags.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                {t('themeTags')}
              </h2>
              <div className="flex flex-wrap gap-2" aria-label={t('wallpaperTags')}>
                {wallpaper.tags.map((tag) => (
                  <span
                    key={`detail-tag-${tag}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-300 border border-zinc-800"
                  >
                    <Tag className="w-3 h-3 text-indigo-400" aria-hidden="true" />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita: Informações Técnicas e Métricas do Steam */}
        <div className="space-y-6">
          {/* Ficha Técnica */}
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4 text-xs">
            <h2 className="font-semibold text-sm text-zinc-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" aria-hidden="true" />
              <span>{t('specs')}</span>
            </h2>

            <dl className="space-y-3">
              <div className="flex justify-between py-1 border-b border-zinc-800/50">
                <dt className="text-zinc-400">{t('resolution')}</dt>
                <dd className="font-mono text-zinc-200">
                  {getResolutionLabel(wallpaper.resolution)}
                </dd>
              </div>

              <div className="flex justify-between py-1 border-b border-zinc-800/50">
                <dt className="text-zinc-400">{t('aspectRatio')}</dt>
                <dd className="font-mono text-zinc-200">{wallpaper.aspectRatio}</dd>
              </div>

              <div className="flex justify-between py-1 border-b border-zinc-800/50">
                <dt className="text-zinc-400">{t('mediaType')}</dt>
                <dd className="text-zinc-200">{t(`type${wallpaper.type}`)}</dd>
              </div>

              {wallpaper.fileSizeBytes && (
                <div className="flex justify-between py-1 border-b border-zinc-800/50">
                  <dt className="text-zinc-400">{t('estimatedSize')}</dt>
                  <dd className="font-mono text-zinc-200">
                    {formatFileSize(wallpaper.fileSizeBytes)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-zinc-800/50">
                <dt className="text-zinc-400">{t('rating')}</dt>
                <dd className="text-zinc-200">{wallpaper.rating}</dd>
              </div>

              <div className="flex justify-between py-1">
                <dt className="text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" aria-hidden="true" />
                  <span>{t('updated')}</span>
                </dt>
                <dd className="text-zinc-300">{formatDate(wallpaper.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Métricas de Popularidade */}
          {wallpaper.stats && (
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4 text-xs">
              <h2 className="font-semibold text-sm text-zinc-200">{t('workshopStats')}</h2>

              <div className="grid grid-cols-2 gap-3">
                {wallpaper.stats.views !== undefined && (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                      <Eye className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                      <span>{t('views')}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-100 font-mono">
                      {wallpaper.stats.views.toLocaleString(language)}
                    </span>
                  </div>
                )}

                {wallpaper.stats.subscriptions !== undefined && (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                      <Download className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span>{t('subscriptions')}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-100 font-mono">
                      {wallpaper.stats.subscriptions.toLocaleString(language)}
                    </span>
                  </div>
                )}

                {wallpaper.stats.favorited !== undefined && (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/60">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                      <Heart className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                      <span>{t('favorites')}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-100 font-mono">
                      {wallpaper.stats.favorited.toLocaleString(language)}
                    </span>
                  </div>
                )}

                {wallpaper.stats.votesUp !== undefined && (
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-400 mb-1">
                      <ThumbsUp className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                      <span>{t('upvotes')}</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-100 font-mono">
                      {wallpaper.stats.votesUp.toLocaleString(language)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cartão de Ação Direta no Steam */}
          <div className="p-5 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-zinc-900/90 border border-indigo-500/30 space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-100">{t('availableSteam')}</h3>
                <p className="text-[11px] text-zinc-400">Wallpaper Engine • AppID 431960</p>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              {t('steamDescription')}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              {steamLinks(wallpaper.id, wallpaper.isSimulated).web && (
                <a
                  href={steamLinks(wallpaper.id, wallpaper.isSimulated).web}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                >
                  <span>{t('openSteam')}</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* Seção de Wallpapers Recomendados */}
      <WallpaperRecommendations wallpapers={recommendations} onSelectWallpaper={onSelectWallpaper} />
    </article>
  );
}


