import { forwardRef, useMemo } from 'react';
import { parseMarkdown } from '@/lib/markdown';
import DOMPurify from 'dompurify';

export const MarkdownPreview = forwardRef<HTMLElement, { markdown: string; className?: string }>(function MarkdownPreview({ markdown, className = 'document-body' }, ref) {
  const html = useMemo(() => DOMPurify.sanitize(parseMarkdown(markdown)), [markdown]);
  return <article ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});
