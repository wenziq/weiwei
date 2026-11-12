import { marked, type TokenizerExtension } from 'marked';

const punctuationStrong: TokenizerExtension = {
  name: 'strong',
  level: 'inline',
  tokenizer(source) {
    const match = source.match(/^\*\*(?=\S)([\s\S]*?[\p{P}\p{S}])\*\*(?=[\p{L}\p{N}])/u);
    if (!match) return undefined;
    return { type: 'strong', raw: match[0], tokens: this.lexer.inlineTokens(match[1] ?? '') };
  },
};
marked.use({ extensions: [punctuationStrong] });

export function parseMarkdown(markdown: string) {
  return marked.parse(markdown, { async: false });
}

export function markdownExcerpt(markdown: string) {
  const first = marked.lexer(markdown).find(token => token.type === 'paragraph');
  return first?.type === 'paragraph' ? first.text.replace(/[*_`]/g, '').slice(0, 100) : '尚未填写研究正文';
}
