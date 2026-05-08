import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Article, Library } from "./types";

const dataPath = path.join(process.cwd(), "content/articles.json");

export function loadLibrary(): Library {
  if (!existsSync(dataPath)) {
    return { generatedAt: "", vaultPath: "", clusters: [] };
  }
  return JSON.parse(readFileSync(dataPath, "utf8"));
}

export function allArticles(): Article[] {
  return loadLibrary().clusters.flatMap((c) => c.articles);
}

export function findBySlug(slug: string): Article | undefined {
  return allArticles().find((a) => a.slug === slug);
}
