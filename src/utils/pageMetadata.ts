import { translate } from '../i18n/translations.ts';

export const SITE_TITLE = translate('en', 'siteTitle');
export const SITE_DESCRIPTION = translate('en', 'siteDescription');

/** Apenas metadados textuais; nenhum domínio/canonical é inferido do ambiente local. */
export function updatePageMetadata(title: string, description: string): () => void {
  const previousTitle = document.title;
  const selectors = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[name="twitter:title"]', 'meta[name="twitter:description"]'];
  const previous = selectors.map(selector => {
    const element = document.querySelector<HTMLMetaElement>(selector);
    return { element, content: element?.content };
  });
  document.title = title;
  previous.forEach(({ element }, index) => { if (element) element.content = index === 1 || index === 3 ? title : description; });
  return () => {
    document.title = previousTitle;
    previous.forEach(({ element, content }) => { if (element && content !== undefined) element.content = content; });
  };
}
