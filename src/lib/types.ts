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
