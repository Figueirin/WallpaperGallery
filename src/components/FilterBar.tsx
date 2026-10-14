import {
  SlidersHorizontal,
  RotateCcw,
  Layers,
  Film,
  Globe,
  Monitor,
  Tag as TagIcon,
  ArrowUpDown,
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
  const typeIcons: Record<WallpaperType, React.ReactNode> = {
    Scene: <Layers className="w-3.5 h-3.5" aria-hidden="true" />,
    Video: <Film className="w-3.5 h-3.5" aria-hidden="true" />,
    Web: <Globe className="w-3.5 h-3.5" aria-hidden="true" />,
    Application: <Monitor className="w-3.5 h-3.5" aria-hidden="true" />,
  };

  return (
    <section
      aria-label="Filtros e ordenação do catálogo"
      className="mb-8 p-4 md:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-4 text-xs"
    >
      {/* Linha Superior: Cabeçalho dos filtros e Ordenação */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-zinc-800/60">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          <h2 className="font-semibold text-sm text-zinc-200">Filtros do Catálogo</h2>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Filtros ativos
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Ação de Limpeza Rápida */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              title="Restaurar todos os filtros para o padrão"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>Limpar filtros</span>
            </button>
          )}

          {/* Seletor de Ordenação */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="sort-select" className="text-zinc-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-zinc-500" aria-hidden="true" />
              <span className="hidden sm:inline">Ordenar:</span>
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="popularity_desc">Mais populares</option>
              <option value="date_desc">Mais recentes</option>
              <option value="date_asc">Mais antigos</option>
              <option value="title_asc">Título (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Linha de Filtros Principais: Tipo e Resolução distribuídos em desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
        {/* Seletor de Tipo de Wallpaper */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-zinc-400 font-medium shrink-0 w-20">Tipo:</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de wallpaper">
            <button
              type="button"
              onClick={() => onSelectType('ALL')}
              className={`px-2.5 py-1 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                selectedType === 'ALL'
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
              }`}
            >
              Todos
            </button>
            {metadata.types.map((type) => (
              <button
                key={`type-${type}`}
                type="button"
                onClick={() => onSelectType(selectedType === type ? 'ALL' : type)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  selectedType === type
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                {typeIcons[type]}
                <span>{type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por Resolução */}
        {metadata.resolutions.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-zinc-400 font-medium shrink-0 w-20">Resolução:</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por resolução">
              {metadata.resolutions.map((res) => {
                const isSelected = selectedResolutions.includes(res);
                return (
                  <button
                    key={`res-${res}`}
                    type="button"
                    onClick={() => onToggleResolution(res)}
                    aria-pressed={isSelected}
                    className={`px-2.5 py-1 rounded-lg border font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isSelected
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold'
                        : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                    title={`Resolução nominal: ${res}`}
                  >
                    {getResolutionLabel(res)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Linha 2: Filtro por Tags (Multi-select com lógica OR) */}
      {metadata.tags.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 pt-2 border-t border-zinc-800/40">
          <span className="text-zinc-400 font-medium shrink-0 w-20 sm:pt-1">Tags (OU):</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tags temáticas">
            {metadata.tags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={`tag-${tag}`}
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  aria-pressed={isSelected}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isSelected
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-semibold'
                      : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <TagIcon className="w-2.5 h-2.5 text-zinc-500" aria-hidden="true" />
                  <span>{tag}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

