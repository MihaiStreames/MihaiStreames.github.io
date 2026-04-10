import type { PostMeta } from "$lib/posts";
import { getPosts } from "$lib/posts";

export function load(): { posts: PostMeta[] } {
	const posts = getPosts();
	return { posts };
}
