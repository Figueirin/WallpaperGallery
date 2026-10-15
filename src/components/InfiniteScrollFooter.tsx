import { useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { observeNextBatch } from '../utils/observeNextBatch';

export interface InfiniteScrollFooterProps {
  loading: boolean;
  hasMore: boolean;
  error: boolean;
  loaded: number;
  total: number;
  onLoadMore: () => void;
  onAutoLoad?: () => void;
}
export function InfiniteScrollFooter({ loading, hasMore, error, loaded, total, onLoadMore, onAutoLoad = onLoadMore }: InfiniteScrollFooterProps) {
  const { t } = useLanguage();
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current || loading || !hasMore || error) return;
    return observeNextBatch(sentinel.current, onAutoLoad);
  }, [loading, hasMore, error, loaded, onAutoLoad]);
  return (
    <div className="mt-8 py-5 flex flex-col items-center gap-3 text-sm text-zinc-400">
      <div ref={sentinel} aria-hidden="true" className="h-px w-full" />
      <p role="status" aria-live="polite">
        {loading ? t('loadingMore') : error ? t('loadMoreError') : !hasMore ? t('endResults') : t('loadedCount', { count: loaded, total })}
      </p>
      {hasMore && (
        <button type="button" disabled={loading} onClick={onLoadMore}
          className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          {t(error ? 'retry' : 'loadMore')}
        </button>
      )}
    </div>
  );
}
