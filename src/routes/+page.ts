import type { PostMeta } from "$lib/posts";
import { getPosts } from "$lib/posts";

export function load(): { recentPosts: PostMeta[] } {
	const posts = getPosts();
	return { recentPosts: posts.slice(0, 3) };
}
