export type Mode = "Q" | "A" | "H";

export type Highlight = {
  // The highlighted passage (markdown blockquote source, joined to plain text).
  quote: string;
  // Optional annotation the reader attached.
  comment?: string;
  // Pre-rendered HTML of `comment` (built server-side; no client markdown parser).
  commentHtml?: string;
  // ISO timestamp the highlight was captured.
  timestamp?: string;
};

export type Article = {
  slug: string;
  title: string;
  url: string;
  description?: string;
  cluster: string;
  tier?: string;
  mode?: Mode;
  read: boolean;
  byline?: string;
  excerpt?: string;
  content?: string;
  fetchedAt?: string;
  fetchError?: string;
  domain: string;
  // Highlights captured on this article, loaded from the vault at build time
  // (the worker appends them to inbox/notes/highlights/<slug>.md).
  highlights?: Highlight[];
};

export type Cluster = {
  title: string;
  description?: string;
  articles: Article[];
};

export type Library = {
  generatedAt: string;
  vaultPath: string;
  clusters: Cluster[];
};
