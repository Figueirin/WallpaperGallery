import { User } from 'lucide-react';
import type { WallpaperAuthor } from '../types/wallpaper';
import { getAuthorDisplayName } from '../utils/authors';

export function AuthorName({ author, className = '' }: { author: WallpaperAuthor; className?: string }) {
  const name = getAuthorDisplayName(author);
  if (!name) return null;
  return <span className={`inline-flex items-center gap-1.5 ${className}`}>
    <User className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
    <span className="truncate">{name}</span>
  </span>;
}
