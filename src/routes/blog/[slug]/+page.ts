import { error } from "@sveltejs/kit";
import type { Component } from "svelte";
import type { PostMeta } from "$lib/posts";

interface MdsvexModule {
	default: Component;
	metadata: Omit<PostMeta, "slug">;
}

export function load({ params }: { params: { slug: string } }): {
	content: Component;
	meta: Omit<PostMeta, "slug">;
} {
	try {
		const modules = import.meta.glob("/src/posts/*.md", { eager: true });
		const key = `/src/posts/${params.slug}.md`;
		const post = modules[key] as MdsvexModule | undefined;
		if (post === undefined) {
			error(404, `Post not found: ${params.slug}`);
		}
		return {
			content: post.default,
			meta: post.metadata,
		};
	} catch {
		error(404, `Post not found: ${params.slug}`);
	}
}
