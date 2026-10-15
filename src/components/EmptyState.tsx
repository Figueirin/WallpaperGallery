import { useLanguage } from '../i18n/LanguageContext';
import { SearchX, AlertTriangle, RotateCcw } from 'lucide-react';

interface EmptyStateProps {
  type?: 'empty' | 'error';
  title?: string;
  description?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export function EmptyState({
  type = 'empty',
  title,
  description,
  onReset,
  resetLabel,
}: EmptyStateProps) {
  const { t } = useLanguage();
  const isError = type === 'error';

  return (
    <div
      role="region"
      aria-label={isError ? t('errorNotice') : t('noneFound')}
      className="flex flex-col items-center justify-center p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/60 max-w-lg mx-auto my-12"
    >
      <div
        className={`p-4 rounded-2xl mb-4 border ${
          isError
            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            : 'bg-zinc-800/60 text-zinc-400 border-zinc-700/50'
        }`}
      >
        {isError ? (
          <AlertTriangle className="w-8 h-8" aria-hidden="true" />
        ) : (
          <SearchX className="w-8 h-8" aria-hidden="true" />
        )}
      </div>

      <h3 className="text-lg font-semibold text-zinc-100 mb-1">
        {title || (isError ? t('loadFailed') : t('noneFound'))}
      </h3>

      <p className="text-sm text-zinc-400 mb-6 max-w-sm">
        {description ||
          (isError
            ? t('loadErrorDescription')
            : t('emptyDescription'))}
      </p>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 hover:border-zinc-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          {resetLabel || (isError ? t('retry') : t('clearSearch'))}
        </button>
      )}
    </div>
  );
}

