<script lang="ts">
	import type { PageData } from "./$types";
	import { resolve } from "$app/paths";

	const { data }: { data: PageData } = $props();
</script>

<h1><span class="py-keyword">def</span> <span class="py-func">blog</span>():</h1>

<div class="post-list">
	{#each data.posts as post (post.slug)}
		<article>
			<a href={resolve("/blog/[slug]", { slug: post.slug })}>
				<span class="post-title">{post.title}</span>
			</a>
			<span class="py-comment"> # {post.date}</span>
			<p class="excerpt">{post.excerpt}</p>
			{#if post.categories.length > 0}
				<p class="tags">
					{#each post.categories as cat, i (cat)}
						{#if i > 0}{" "}{/if}<span class="py-decorator">@{cat}</span>
					{/each}
				</p>
			{/if}
		</article>
	{/each}
</div>

<style>
	h1 {
		margin-bottom: var(--space-sm);
	}

	article {
		padding: var(--space-md) 0;
		border-bottom: 1px solid var(--ctp-surface0);
	}

	article:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.post-title {
		font-size: 1.1rem;
	}

	.excerpt {
		color: var(--ctp-subtext0);
		font-size: 0.9rem;
		margin-top: var(--space-xs);
	}

	.tags {
		font-size: 0.85rem;
		margin-top: var(--space-xs);
	}
</style>
