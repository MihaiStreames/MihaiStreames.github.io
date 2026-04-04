import { getPosts } from "$lib/posts";

export async function load() {
	const posts = await getPosts();
	return { recentPosts: posts.slice(0, 3) };
}
