import { error } from "@sveltejs/kit";
import type { Component } from "svelte";
import type { PostMeta } from "$lib/posts";

interface MdsvexModule {
  default: Component;
  metadata: Omit<PostMeta, "slug">;
}

interface PostPageMeta extends Omit<PostMeta, "slug"> {
  url: string;
  image: string;
}

export function load({ params }: { params: { slug: string } }): {
  content: Component;
  meta: PostPageMeta;
} {
  try {
    const modules = import.meta.glob("/src/posts/*.md", { eager: true });
    const key = `/src/posts/${params.slug}.md`;
    const post = modules[key] as MdsvexModule | undefined;

    if (post === undefined) {
      error(404, `Post not found: ${params.slug}`);
    }

    const host = "https://mihaistreames.github.io";
    const url = `${host}/blog/${params.slug}`;
    const hero = post.metadata.image ?? "";

    // scrapers often choke on animated gif, swap to sibling .png for og
    const ogPath = hero.endsWith(".gif") ? hero.replace(/\.gif$/, "-og.png") : hero;
    const image = ogPath !== "" ? `${host}${ogPath}` : `${host}/og-image.png`;

    return {
      content: post.default,
      meta: { ...post.metadata, url, image },
    };
  } catch {
    error(404, `Post not found: ${params.slug}`);
  }
}
