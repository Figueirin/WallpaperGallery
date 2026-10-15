import { useEffect } from 'react';
import { updatePageMetadata } from './pageMetadata';

export function usePageMetadata(title?: string, description?: string) {
  useEffect(() => {
    if (!title || !description) return;
    // Each active view owns its metadata; avoid restoring a previous locale on navigation.
    updatePageMetadata(title, description);
  }, [title, description]);
}
