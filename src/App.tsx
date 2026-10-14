import { useEffect, useState } from 'react';
import { MockWallpaperProvider } from './services/mockProvider';
import { WallpaperItem, FilterMetadata } from './types/wallpaper';
import { Sparkles, Tag, ExternalLink } from 'lucide-react';

const provider = new MockWallpaperProvider();

export function App() {
  const [wallpapers, setWallpapers] = useState<WallpaperItem[]>([]);
  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [result, meta] = await Promise.all([
          provider.getWallpapers({ pageSize: 4 }),
          provider.getFilterMetadata(),
        ]);
        setWallpapers(result.items);
        setMetadata(meta);
      } catch (error) {
        console.error('Erro ao inicializar provider:', error);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 md:p-12">
      <header className="max-w-6xl mx-auto mb-10 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-50">
              Workshop Gallery
            </h1>
            <p className="text-sm text-zinc-400">
              Catálogo visual para Wallpaper Engine • KDE Plasma / Linux
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            ● Etapa 2 Concluída: Mock & Arquitetura Base
          </span>
          {metadata && (
            <>
              <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700">
                {metadata.tags.length} Tags detectadas
              </span>
              <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700">
                {metadata.resolutions.length} Resoluções disponíveis
              </span>
            </>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto">
        <h2 className="text-lg font-semibold mb-4 text-zinc-200">
          Amostra do MockDataProvider (Validação de Tipagem e Estrutura)
        </h2>

        {loading ? (
          <div className="p-8 text-center text-zinc-500 animate-pulse">
            Carregando catálogo simulado...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {wallpapers.map((item) => (
              <div
                key={item.id}
                className="group flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-all duration-200"
              >
                <div className="aspect-video w-full overflow-hidden bg-zinc-950 relative">
                  <img
                    src={item.previewUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-zinc-300 border border-white/10">
                    {item.resolution}
                  </div>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-medium text-sm text-zinc-100 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {item.tags[0]}
                    </span>
                    <a
                      href={item.steamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                    >
                      Steam <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
export default App;

