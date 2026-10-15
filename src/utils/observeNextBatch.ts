/** The caller disconnects while loading, on error, on detail pages, and at the end. */
export function observeNextBatch(target: Element, load: () => void, Observer: typeof IntersectionObserver | undefined = globalThis.IntersectionObserver): () => void {
  if (!Observer) return () => {};
  let active = true;
  const observer = new Observer(entries => {
    if (active && entries.some(entry => entry.isIntersecting)) load();
  }, { rootMargin: '300px 0px', threshold: 0 });
  observer.observe(target);
  return () => { active = false; observer.disconnect(); };
}
