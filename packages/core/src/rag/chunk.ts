import { getEncoding } from 'js-tiktoken';

const NOISE_HEADING = '## Perfect Pairings For Your Plants';
const H2_HEADING_RE = /^## .+$/gm;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const H1_LINE_RE = /^#\s+.+$/m;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[A-ZÀ-Ö0-9])/;

export const MAX_CHUNK_TOKENS = 400;
export const OVERLAP_SENTENCES = 2;

export interface SourceArticle {
  source: string;
  title: string;
  category: string;
  body: string;
}

export interface ArticleChunk {
  chunkIndex: number;
  content: string;
}

export interface ChunkedArticle {
  source: string;
  title: string;
  category: string;
  chunks: ArticleChunk[];
}

interface Section {
  sectionTitle: string | null;
  text: string;
}

let encoding: ReturnType<typeof getEncoding> | undefined;

function getTokenEncoding() {
  encoding ??= getEncoding('cl100k_base');
  return encoding;
}

function countTokens(text: string): number {
  return getTokenEncoding().encode(text).length;
}

export function parseArticle(fileContent: string, filename: string): SourceArticle {
  const frontmatterMatch = FRONTMATTER_RE.exec(fileContent);
  if (!frontmatterMatch) {
    throw new Error(`Hiányzó frontmatter: ${filename}`);
  }

  const fields = new Map<string, string>();
  for (const line of frontmatterMatch[1].split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    fields.set(key, value);
  }

  const title = fields.get('title');
  const category = fields.get('category');
  if (!title || !category) {
    throw new Error(`Hiányzó title/category a frontmatterben: ${filename}`);
  }

  const afterFrontmatter = fileContent.slice(frontmatterMatch[0].length);
  const h1Match = H1_LINE_RE.exec(afterFrontmatter);
  const body = h1Match
    ? afterFrontmatter.slice(h1Match.index + h1Match[0].length)
    : afterFrontmatter;

  return { source: filename, title, category, body };
}

export function stripStoreNoise(body: string): string {
  const noiseIndex = body.indexOf(NOISE_HEADING);
  return noiseIndex === -1 ? body : body.slice(0, noiseIndex);
}

export function splitByH2(body: string): Section[] {
  const headingMatches = [...body.matchAll(H2_HEADING_RE)];
  const sections: Section[] = [];

  const introEnd = headingMatches[0]?.index ?? body.length;
  const introText = body.slice(0, introEnd).trim();
  if (introText) {
    sections.push({ sectionTitle: null, text: introText });
  }

  for (const [i, match] of headingMatches.entries()) {
    const sectionTitle = match[0].replace(/^##\s+/, '').trim();
    const start = match.index + match[0].length;
    const end = headingMatches[i + 1]?.index ?? body.length;
    const text = body.slice(start, end).trim();
    if (text) {
      sections.push({ sectionTitle, text });
    }
  }

  return sections;
}

function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function packIntoTokenChunks(text: string): string[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const candidate = [...current, sentence].join(' ');
    if (current.length > 0 && countTokens(candidate) > MAX_CHUNK_TOKENS) {
      chunks.push(current.join(' '));
      const overlap = current.slice(-OVERLAP_SENTENCES);
      current = [...overlap, sentence];
    } else {
      current.push(sentence);
    }
  }
  if (current.length > 0) {
    chunks.push(current.join(' '));
  }

  return chunks;
}

function buildContextPrefix(title: string, sectionTitle: string | null): string {
  return sectionTitle ? `${title} — ${sectionTitle}` : title;
}

export function chunkArticle(fileContent: string, filename: string): ChunkedArticle {
  const article = parseArticle(fileContent, filename);
  const cleanedBody = stripStoreNoise(article.body);
  const sections = splitByH2(cleanedBody);

  const chunks: ArticleChunk[] = [];
  for (const section of sections) {
    const prefix = buildContextPrefix(article.title, section.sectionTitle);
    for (const piece of packIntoTokenChunks(section.text)) {
      chunks.push({
        chunkIndex: chunks.length,
        content: `${prefix}\n\n${piece}`,
      });
    }
  }

  return {
    source: article.source,
    title: article.title,
    category: article.category,
    chunks,
  };
}
