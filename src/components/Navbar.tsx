import { type KeyboardEvent } from 'react';
import { Search, X, Sparkles, Loader2 } from 'lucide-react';

interface NavbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalCount: number;
  onNavigateHome?: () => void;
  isLoading?: boolean;
}

export function Navbar({
  searchQuery,
  onSearchChange,
  totalCount,
  onNavigateHome,
  isLoading = false,
}: NavbarProps) {
  const handleClear = () => {
    onSearchChange('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80">
      <div className="max-w-[2400px] w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 h-18 flex items-center justify-between gap-4">
        {/* Identidade do Projeto / Logo */}
        <div
          onClick={onNavigateHome}
          role={onNavigateHome ? 'button' : undefined}
          tabIndex={onNavigateHome ? 0 : undefined}
          onKeyDown={(e) => {
            if (onNavigateHome && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onNavigateHome();
            }
          }}
          aria-label={onNavigateHome ? 'Ir para a página inicial da galeria' : undefined}
          className={`flex items-center gap-3 shrink-0 ${
            onNavigateHome
              ? 'cursor-pointer hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl'
              : ''
          }`}
        >
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-zinc-100">
                Workshop Gallery
              </span>

            </div>
            <p className="hidden md:block text-xs text-zinc-400">
              Catálogo visual para Wallpaper Engine
            </p>
          </div>
        </div>

        {/* Barra de Pesquisa */}
        <div className="flex-1 max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl mx-2 sm:mx-4">
          <div className="relative">
            <label htmlFor="wallpaper-search" className="sr-only">
              Pesquisar wallpapers por título, tags ou autor
            </label>
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              {isLoading ? (
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <input
              id="wallpaper-search"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pesquisar wallpapers..."
              className="w-full pl-10 pr-9 py-2 rounded-xl text-sm bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Limpar campo de pesquisa"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-r-xl"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Links externos e Contador */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-400 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{totalCount} wallpapers</span>
          </div>

          <a
            href="https://github.com/Figueirin/WallpaperGallery"
            target="_blank"
            rel="noopener noreferrer"
            title="Repositório no GitHub"
            aria-label="Acessar repositório no GitHub"
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
