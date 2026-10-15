import { useLanguage } from '../i18n/LanguageContext';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  isLoading = false,
}: PaginationProps) {
  const { t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= 0 || totalPages <= 1) {
    if (totalItems > 0) {
      return (
        <div className="mt-8 py-4 flex justify-center text-xs text-zinc-500 font-medium">
          {t(totalItems === 1 ? 'showOne' : 'showAll', { count: totalItems })}
        </div>
      );
    }
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  // Gera lista de páginas para exibição em telas médias e grandes
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 8) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];
    pages.push(1);

    const leftBoundary = Math.max(2, currentPage - 1);
    const rightBoundary = Math.min(totalPages - 1, currentPage + 1);

    if (leftBoundary > 2) {
      pages.push('ellipsis');
    }

    for (let i = leftBoundary; i <= rightBoundary; i++) {
      pages.push(i);
    }

    if (rightBoundary < totalPages - 1) {
      pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
  };

  const pageNumbers = getPageNumbers();

  const handlePageClick = (page: number) => {
    if (page !== currentPage && page >= 1 && page <= totalPages && !isLoading) {
      onPageChange(page);
    }
  };

  return (
    <nav
      aria-label={t('paginationLabel')}
      className="mt-10 pt-6 pb-4 border-t border-zinc-800/80 flex flex-col gap-4"
    >
      {/* Contagem informativa de itens exibidos */}
      <div className="text-xs text-zinc-400 font-medium text-center sm:text-left flex items-center justify-between">
        <span>
          {t('showRange', { start: startItem, end: endItem, total: totalItems })}
        </span>
        <span className="text-zinc-500 hidden sm:inline">
          {t('pageOf', { page: currentPage, total: totalPages })}
        </span>
      </div>

      {/* Controles Mobile (< 640px): Botões largos, confortáveis ao toque, sem quebra de linha */}
      <div className="flex sm:hidden items-center justify-between w-full gap-2 pt-1">
        <button
          type="button"
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label={t('previousPage')}
          className="inline-flex items-center justify-center gap-1.5 flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-200 active:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          <span>{t('previous')}</span>
        </button>

        <span className="text-xs font-semibold text-zinc-300 px-3.5 py-2.5 bg-zinc-900/90 rounded-xl border border-zinc-800 font-mono shrink-0">
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label={t('nextPage')}
          className="inline-flex items-center justify-center gap-1.5 flex-1 min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold bg-zinc-900 border border-zinc-800 text-zinc-200 active:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <span>{t('next')}</span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Controles Tablet / Desktop (>= 640px): Paginação completa com botões numéricos */}
      <div className="hidden sm:flex items-center justify-center gap-1.5 flex-wrap">
        {/* Primeira Página */}
        <button
          type="button"
          onClick={() => handlePageClick(1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label={t('firstPage')}
          title={t('goFirst')}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <ChevronsLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden md:inline">{t('first')}</span>
        </button>

        {/* Página Anterior */}
        <button
          type="button"
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label={t('previousPage')}
          title={t('goPrevious')}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t('previous')}</span>
        </button>

        {/* Números das Páginas */}
        <div className="flex items-center gap-1 px-1">
          {pageNumbers.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 py-1 text-xs text-zinc-600 select-none font-mono"
                  aria-hidden="true"
                >
                  …
                </span>
              );
            }

            const isCurrent = page === currentPage;
            return (
              <button
                key={`page-${page}`}
                type="button"
                onClick={() => handlePageClick(page)}
                disabled={isLoading}
                aria-current={isCurrent ? 'page' : undefined}
                aria-label={t('goPage', { page })}
                className={`min-w-9 h-9 px-2.5 rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                  isCurrent
                    ? 'bg-indigo-600 text-white font-bold border border-indigo-500 shadow-md shadow-indigo-600/25 ring-1 ring-white/10'
                    : 'bg-zinc-900/80 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white hover:border-zinc-700'
                } disabled:cursor-not-allowed`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Próxima Página */}
        <button
          type="button"
          onClick={() => handlePageClick(currentPage + 1)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label={t('nextPage')}
          title={t('goNext')}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <span>{t('next')}</span>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Última Página */}
        <button
          type="button"
          onClick={() => handlePageClick(totalPages)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label={t('lastPage')}
          title={t('goLast')}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <span className="hidden md:inline">{t('last')}</span>
          <ChevronsRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
