"use client";

import { useEffect } from "react";
import { recordLastOpened } from "@/lib/nav-state";

export default function LastOpenedRecorder({ slug }: { slug: string }) {
  useEffect(() => {
    recordLastOpened(slug);
  }, [slug]);
  return null;
}
