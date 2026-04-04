<script lang="ts">
	import type { PageData } from "./$types";
	import { resolve } from "$app/paths";

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.meta.title} - MihaiStreames</title>
	<meta name="description" content={data.meta.excerpt} />
</svelte:head>

<article>
	<header>
		<h1>{data.meta.title}</h1>
		<p class="meta">
			<span class="py-comment"># {data.meta.date}</span>
			{#if data.meta.categories?.length}
				<span class="categories">
					{#each data.meta.categories as cat, i (cat)}
						{#if i > 0}{" "}{/if}<span class="py-decorator">@{cat}</span>
					{/each}
				</span>
			{/if}
		</p>
	</header>

	<div class="prose">
		<data.content />
	</div>

	<footer>
		<a href={resolve("/blog")}
			><span class="py-keyword">return</span> <span class="py-func">blog</span>()</a
		>
	</footer>
</article>

<style>
	header {
		margin-bottom: var(--space-lg);
	}

	.meta {
		margin-top: var(--space-sm);
		font-size: 0.9rem;
	}

	.categories {
		margin-left: var(--space-sm);
	}

	footer {
		margin-top: var(--space-lg);
		padding-top: var(--space-md);
		border-top: 1px solid var(--ctp-surface0);
	}
</style>
