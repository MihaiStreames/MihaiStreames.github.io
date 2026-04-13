import type { PostMeta } from "$lib/posts";
import { getPosts } from "$lib/posts";

/**
 * Load all blog posts for the blog index page.
 *
 * @returns Object with posts, all posts sorted newest-first.
 */
export function load(): { posts: PostMeta[] } {
	const posts = getPosts();
	return { posts };
}
