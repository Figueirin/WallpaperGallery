import { useLanguage } from '../i18n/LanguageContext';
import { useState } from 'react';
import {
  SlidersHorizontal,
  RotateCcw,
  Layers,
  Film,
  Globe,
  Monitor,
  Tag as TagIcon,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FilterMetadata, SortOption, WallpaperType } from '../types/wallpaper';
import { getResolutionLabel } from '../utils/filterWallpapers';

interface FilterBarProps {
  metadata: FilterMetadata;
  selectedType: WallpaperType | 'ALL';
  onSelectType: (type: WallpaperType | 'ALL') => void;
  selectedResolutions: string[];
  onToggleResolution: (res: string) => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function FilterBar({
  metadata,
  selectedType,
  onSelectType,
  selectedResolutions,
  onToggleResolution,
  selectedTags,
  onToggleTag,
  sortBy,
  onSortChange,
  onResetFilters,
  hasActiveFilters,
}: FilterBarProps) {
  const { t } = useLanguage();
  const typeIcons: Record<WallpaperType, React.ReactNode> = {
    Scene: <Layers className="w-3.5 h-3.5" aria-hidden="true" />,
    Video: <Film className="w-3.5 h-3.5" aria-hidden="true" />,
    Web: <Globe className="w-3.5 h-3.5" aria-hidden="true" />,
    Application: <Monitor className="w-3.5 h-3.5" aria-hidden="true" />,
  };

  const [isExpandedTags, setIsExpandedTags] = useState(false);

  const visibleTags = isExpandedTags
    ? metadata.tags
    : metadata.tags.filter((tag, idx) => idx < 12 || selectedTags.includes(tag));
  const hiddenCount = metadata.tags.length - visibleTags.length;

  return (
    <section
      aria-label={t('filtersLabel')}
      className="mb-8 p-4 md:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4 text-xs"
    >
      {/* Linha Superior: Cabeçalho dos filtros e Ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          <h2 className="font-semibold text-sm text-zinc-200">{t('filters')}</h2>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {t('activeFilters')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Ação de Limpeza Rápida */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
              title={t('restoreFilters')}
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>{t('clearFilters')}</span>
            </button>
          )}

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sort-select" className="text-zinc-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-zinc-500" aria-hidden="true" />
              <span className="hidden sm:inline">{t('sort')}</span>
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="popularity_desc">{t('popular')}</option>
              <option value="date_desc">{t('newest')}</option>
              <option value="date_asc">{t('oldest')}</option>
              <option value="title_asc">{t('titleAZ')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Linha de Filtros Principais: Tipo e Resolução agrupados com proximidade */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Seletor de Tipo de Wallpaper */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-medium shrink-0">{t('type')}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterType')}>
            <button
              type="button"
              onClick={() => onSelectType('ALL')}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                selectedType === 'ALL'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                  : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              {t('all')}
            </button>
            {metadata.types.map((type) => (
              <button
                key={`type-${type}`}
                type="button"
                onClick={() => onSelectType(selectedType === type ? 'ALL' : type)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                  selectedType === type
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {typeIcons[type]}
                <span>{t(`type${type}`)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Divisor vertical em telas maiores */}
        {metadata.resolutions.length > 0 && (
          <div className="hidden sm:block h-5 w-px bg-zinc-800" aria-hidden="true" />
        )}

        {/* Filtro por Resolução aproximado */}
        {metadata.resolutions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium shrink-0">{t('resolutionColon')}</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterResolution')}>
              {metadata.resolutions.map((res) => {
                const isSelected = selectedResolutions.includes(res);
                return (
                  <button
                    key={`res-${res}`}
                    type="button"
                    onClick={() => onToggleResolution(res)}
                    aria-pressed={isSelected}
                    className={`px-2.5 py-1 rounded-lg border font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold shadow-xs'
                        : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                    title={t('nominalResolution', { resolution: res })}
                  >
                    {getResolutionLabel(res)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Linha 2: Filtro por Tags com visualização colapsável inteligente */}
      {metadata.tags.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-3 border-t border-zinc-800/40">
          <span className="text-zinc-400 font-medium shrink-0 sm:pt-1">{t('tagsOr')}</span>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('filterTags')}>
            {visibleTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={`tag-${tag}`}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold shadow-xs'
                      : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <TagIcon className="w-2.5 h-2.5 text-zinc-500" aria-hidden="true" />
                  <span>{tag}</span>
                </button>
              );
            })}

            {/* Botão para Expandir / Recolher Tags quando houver muitas */}
            {metadata.tags.length > 12 && (
              <button
                type="button"
                onClick={() => setIsExpandedTags((prev) => !prev)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-expanded={isExpandedTags}
              >
                <span>{isExpandedTags ? t('collapseTags') : t('moreTags', { count: hiddenCount })}</span>
                {isExpandedTags ? (
                  <ChevronUp className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

