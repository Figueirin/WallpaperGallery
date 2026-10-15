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
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= 0 || totalPages <= 1) {
    if (totalItems > 0) {
      return (
        <div className="mt-8 py-4 flex justify-center text-xs text-zinc-500 font-medium">
          Exibindo todos os {totalItems} {totalItems === 1 ? 'wallpaper' : 'wallpapers'}
        </div>
      );
    }
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  // Gera a lista de páginas a exibir com lógica de reticências quando totalPages for grande
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 8) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];
    const delta = 1; // páginas ao redor da atual

    pages.push(1);

    const leftBoundary = Math.max(2, currentPage - delta);
    const rightBoundary = Math.min(totalPages - 1, currentPage + delta);

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
      aria-label="Navegação de páginas do catálogo"
      className="mt-10 pt-6 pb-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      {/* Contagem informativa de itens exibidos */}
      <div className="text-xs text-zinc-400 font-medium text-center sm:text-left">
        Exibindo <span className="text-zinc-200 font-semibold">{startItem}–{endItem}</span> de{' '}
        <span className="text-zinc-200 font-semibold">{totalItems}</span> wallpapers{' '}
        <span className="text-zinc-500 font-normal">
          (Página {currentPage} de {totalPages})
        </span>
      </div>

      {/* Controles de Navegação */}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* Primeira Página */}
        <button
          type="button"
          onClick={() => handlePageClick(1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Primeira página"
          title="Ir para a primeira página"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <ChevronsLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden md:inline">Primeira</span>
        </button>

        {/* Página Anterior */}
        <button
          type="button"
          onClick={() => handlePageClick(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          aria-label="Página anterior"
          title="Ir para a página anterior"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        {/* Números das Páginas */}
        <div className="flex items-center gap-1">
          {pageNumbers.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 py-1 text-xs text-zinc-600 select-none"
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
                aria-label={`Ir para a página ${page}`}
                className={`min-w-8 h-8 px-2 rounded-xl text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer ${
                  isCurrent
                    ? 'bg-indigo-600 text-white font-semibold border border-indigo-500 shadow-md shadow-indigo-600/20'
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
          aria-label="Próxima página"
          title="Ir para a próxima página"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        {/* Última Página */}
        <button
          type="button"
          onClick={() => handlePageClick(totalPages)}
          disabled={currentPage >= totalPages || isLoading}
          aria-label="Última página"
          title="Ir para a última página"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 hover:border-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900 disabled:hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
        >
          <span className="hidden md:inline">Última</span>
          <ChevronsRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
