import { translate, type Language } from '../i18n/translations.ts';
import { canonicalUrl, DEFAULT_SOCIAL_IMAGE, SITE_NAME } from '../config/site.ts';

export const SITE_TITLE = translate('en', 'siteTitle');
export const SITE_DESCRIPTION = translate('en', 'siteDescription');
export interface PageMetadataOptions {
  wallpaperId?: string | null;
  image?: string;
  language?: Language;
}

export function socialImage(preview?: string): string {
  try {
    const url = new URL(preview ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Missing or invalid media uses the real local default. */ }
  return DEFAULT_SOCIAL_IMAGE;
}

export function structuredData(title: string, description: string, options: PageMetadataOptions = {}) {
  const url = canonicalUrl(options.wallpaperId);
  if (options.wallpaperId && url !== canonicalUrl()) {
    return {
      '@context': 'https://schema.org', '@type': 'WebPage', url, name: title,
      description, inLanguage: options.language ?? 'en',
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: canonicalUrl() },
      primaryImageOfPage: { '@type': 'ImageObject', contentUrl: socialImage(options.image) },
    };
  }
  return { '@context': 'https://schema.org', '@type': 'WebSite', url, name: SITE_NAME, description, inLanguage: ['en', 'pt-BR'] };
}

/** Text stays textContent/content, including untrusted Workshop titles/descriptions. */
export function updatePageMetadata(title: string, description: string, options?: PageMetadataOptions): () => void {
  const previousTitle = document.title;
  const selectors = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]'];
  const previous = selectors.map(selector => {
    const element = document.querySelector<HTMLMetaElement>(selector);
    return { element, content: element?.content };
  });
  document.title = title;
  previous.forEach(({ element }, index) => { if (element) element.content = index === 1 || index === 3 ? title : description; });
  const restore: (() => void)[] = [];
  if (options) {
    const set = (selector: string, tag: string, identity: Record<string, string>, attribute: string, value: string) => {
      const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
      const element = matches[0] ?? document.createElement(tag);
      // An active view owns exactly one canonical/social/schema element.
      matches.slice(1).forEach(duplicate => duplicate.remove());
      const old = attribute === 'textContent' ? element.textContent : element.getAttribute(attribute);
      Object.entries(identity).forEach(([key, content]) => element.setAttribute(key, content));
      if (!matches.length) document.head.appendChild(element);
      if (attribute === 'textContent') element.textContent = value;
      else element.setAttribute(attribute, value);
      restore.push(() => {
        if (!matches.length) element.remove();
        else if (attribute === 'textContent') element.textContent = old;
        else if (old === null) element.removeAttribute(attribute);
        else element.setAttribute(attribute, old);
      });
    };
    const url = canonicalUrl(options.wallpaperId), image = socialImage(options.image);
    set('link[rel="canonical"]', 'link', { rel: 'canonical' }, 'href', url);
    for (const [property, value] of Object.entries({ 'og:url': url, 'og:image': image, 'og:type': 'website', 'og:site_name': SITE_NAME, 'og:locale': options.language === 'pt-BR' ? 'pt_BR' : 'en_US' })) {
      set(`meta[property="${property}"]`, 'meta', { property }, 'content', value);
    }
    set('meta[name="twitter:card"]', 'meta', { name: 'twitter:card' }, 'content', 'summary_large_image');
    set('meta[name="twitter:image"]', 'meta', { name: 'twitter:image' }, 'content', image);
    set('script[type="application/ld+json"]', 'script', { type: 'application/ld+json' }, 'textContent', JSON.stringify(structuredData(title, description, options)));
  }
  return () => {
    document.title = previousTitle;
    previous.forEach(({ element, content }) => { if (element && content !== undefined) element.content = content; });
    restore.reverse().forEach(action => action());
  };
}
