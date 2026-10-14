export function LoadingSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Carregando galeria de wallpapers"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`skeleton-${idx}`}
          className="rounded-2xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden animate-pulse flex flex-col"
        >
          {/* Skeleton da Imagem com proporção 16:9 */}
          <div className="aspect-video w-full bg-zinc-800/60" />

          {/* Skeleton do Conteúdo */}
          <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              {/* Título */}
              <div className="h-4 bg-zinc-800/80 rounded-md w-3/4" />
              {/* Descrição */}
              <div className="h-3 bg-zinc-850 rounded w-full bg-zinc-800/40" />
              <div className="h-3 bg-zinc-850 rounded w-2/3 bg-zinc-800/40" />
            </div>

            {/* Tags e Ação */}
            <div className="pt-3 border-t border-zinc-800/50 flex items-center justify-between">
              <div className="h-5 bg-zinc-800/60 rounded-full w-20" />
              <div className="h-4 bg-zinc-800/60 rounded w-14" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Carregando itens...</span>
    </div>
  );
}

