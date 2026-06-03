"use client";

import * as React from "react";
import { CacheProvider } from "@emotion/react";
import createCache, { EmotionCache } from "@emotion/cache";
import { useServerInsertedHTML } from "next/navigation";

function createEmotionCache(): EmotionCache {
  const cache = createCache({ key: "mui", prepend: true });
  cache.compat = true;
  return cache;
}

type ThemeRegistryProps = {
  children: React.ReactNode;
};

export default function ThemeRegistry({ children }: ThemeRegistryProps) {
  const [cache] = React.useState(() => createEmotionCache());

  useServerInsertedHTML(() => {
    const { key, inserted } = cache;
    const entries = Object.entries(inserted).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    });
    if (entries.length === 0) {
      return null;
    }
    cache.inserted = {};
    return (
      <style
        data-emotion={`${key} ${entries.map(([name]) => name).join(" ")}`}
        key={key}
        dangerouslySetInnerHTML={{
          __html: entries.map(([, value]) => value).join(""),
        }}
      />
    );
  });

  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
