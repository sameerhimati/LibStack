export type Mode = "Q" | "A" | "H";

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
  // Markdown body of any prior vault notes for this article (the worker writes
  // these to inbox/raw/captures/notes/<slug>.md). Header lines are stripped.
  existingNotes?: string;
  // Pre-rendered HTML of `existingNotes` (rendered server-side at build time
  // to avoid shipping a markdown parser to the client).
  existingNotesHtml?: string;
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
