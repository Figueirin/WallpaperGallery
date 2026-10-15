import { useEffect } from 'react';
import { updatePageMetadata } from './pageMetadata';

export function usePageMetadata(title?: string, description?: string) {
  useEffect(() => {
    if (!title || !description) return;
    return updatePageMetadata(title, description);
  }, [title, description]);
}
