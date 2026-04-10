export interface PostMeta {
	title: string;
	date: string;
	categories: string[];
	tags: string[];
	excerpt: string;
	slug: string;
}

export function getPosts(): PostMeta[] {
	const modules = import.meta.glob("/src/posts/*.md", { eager: true });
	const posts: PostMeta[] = [];

	for (const [path, module] of Object.entries(modules)) {
		const { metadata } = module as { metadata: Omit<PostMeta, "slug"> };
		const filename = path.split("/").pop();
		if (filename === undefined) continue;
		const slug = filename.replace(".md", "");
		posts.push({ ...metadata, slug });
	}

	// newest first
	posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	return posts;
}
