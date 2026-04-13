/** Frontmatter metadata extracted from a blog post markdown file. */
export interface PostMeta {
	/** Post title displayed in listings and the page header. */
	title: string;
	/** Publication date in YYYY-MM-DD format. */
	date: string;
	/** Topic categories used for filtering and display. */
	categories: string[];
	/** Descriptive tags for the post. */
	tags: string[];
	/** Short summary shown in blog listings. */
	excerpt: string;
	/** Optional hero image path (e.g. /posts/slug/hero.png) */
	image?: string;
	/** URL-safe slug derived from the filename. */
	slug: string;
}

/**
 * Load all blog posts from the /src/posts/ directory.
 *
 * Uses Vite's import.meta.glob with eager loading to read markdown
 * frontmatter at build time. Posts are sorted newest-first by date.
 *
 * @returns Array of post metadata sorted by date descending.
 */
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
