import type { PostMeta } from "$lib/posts";
import { getPosts } from "$lib/posts";

/**
 * Load the three most recent blog posts for the home page sidebar.
 *
 * @returns Object with recentPosts, the three newest posts by date.
 */
export function load(): { recentPosts: PostMeta[] } {
  const posts = getPosts();
  return { recentPosts: posts.slice(0, 3) };
}
