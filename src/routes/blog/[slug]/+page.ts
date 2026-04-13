import { error } from "@sveltejs/kit";
import type { Component } from "svelte";
import type { PostMeta } from "$lib/posts";

/** Shape of a compiled mdsvex markdown module. */
interface MdsvexModule {
	default: Component;
	metadata: Omit<PostMeta, "slug">;
}

/** Post metadata enriched with canonical URL and resolved OG image. */
interface PostPageMeta extends Omit<PostMeta, "slug"> {
	/** Canonical absolute URL of the post */
	url: string;
	/** Absolute OG image URL - hero if set, otherwise site default */
	image: string;
}

/**
 * Load and render a single blog post by slug.
 *
 * Computes the canonical URL from the slug and resolves the OG image
 * to the post hero (when set) or the site-wide default.
 *
 * @param params - Route params containing the post slug.
 * @returns Compiled mdsvex component and enriched post metadata.
 */
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

		const url = `https://mihaistreames.github.io/blog/${params.slug}`;
		const image =
			post.metadata.image !== undefined && post.metadata.image !== ""
				? `https://mihaistreames.github.io${post.metadata.image}`
				: "https://mihaistreames.github.io/og-image.png";

		return {
			content: post.default,
			meta: { ...post.metadata, url, image },
		};

	} catch {
		error(404, `Post not found: ${params.slug}`);
	}
}
