"use client";

import { useEffect } from "react";

const CANONICAL_HOST = "libstack.itamih.com";

// Aliases that all point at the same Cloudflare Pages project (`libstack`) but
// are separate browser origins — so per-origin storage (vault secret in
// IndexedDB, read-state in localStorage) doesn't carry across them. Funnel them
// to the one canonical origin so settings + reading state live in one place.
//
// Deliberately NOT redirected: `*.libstack.pages.dev` per-deploy preview hashes
// (keeps preview testing usable) and any localhost / LAN-IP dev host.
const REDIRECT_HOSTS = new Set(["reading.itamih.com", "libstack.pages.dev"]);

export default function CanonicalRedirect() {
  useEffect(() => {
    if (REDIRECT_HOSTS.has(location.hostname)) {
      location.replace(
        `https://${CANONICAL_HOST}${location.pathname}${location.search}${location.hash}`,
      );
    }
  }, []);
  return null;
}
