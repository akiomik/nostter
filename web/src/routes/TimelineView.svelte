<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import type { Event } from './types';
	import { pubkey } from '../stores/Author';
	import { Author } from '$lib/Author';
	import Loading from './Loading.svelte';
	import EventComponent from './timeline/EventComponent.svelte';

	export let events: Event[] = [];
	export let readonly = false;
	export let focusEventId: string | undefined = undefined;
	export let load: () => Promise<void>;
	export let showLoading = true;
	export let createdAtFormat: 'auto' | 'time' = 'auto';

	let loading = false;
	let innerHeight: number;
	let scrollY = writable(0);

	onMount(() => {
		console.log('Timeline.onMount');
		scrollY.subscribe(async (y) => {
			const maxHeight = document.documentElement.scrollHeight;
			const scrollRate = Math.floor((100 * (y + innerHeight)) / maxHeight);
			console.debug('[y]', y, innerHeight, maxHeight, scrollRate);

			if (scrollRate > 90 && !loading) {
				console.log('Load more timeline');
				loading = true;
				await load();
				console.log('Timeline loaded');
				loading = false;
			}
		});
	});
</script>

<svelte:window bind:innerHeight bind:scrollY={$scrollY} />

<ul>
	{#each events as event (event.id)}
		<li
			class:focus={event.id === focusEventId}
			class:related={new Author($pubkey).isRelated(event)}
		>
			<EventComponent {event} {readonly} {createdAtFormat} />
		</li>
	{/each}
</ul>
{#if showLoading}
	<div class="loading"><Loading /></div>
{/if}

<style>
	ul {
		list-style: none;
		padding: 0;
		border: 1px solid rgb(239, 243, 244);
		border-bottom-style: none;
	}

	li {
		border-bottom: 1px solid rgb(239, 243, 244);
		animation-name: add;
		animation-duration: 0.8s;
	}

	li.focus {
		border: 1px solid lightgray;
	}

	li.related {
		border-left: 2px solid lightcoral;
	}

	.loading {
		width: 24px;
		margin: 0 auto;
	}

	@keyframes add {
		0% {
			opacity: 0;
		}

		100% {
			opacity: 1;
		}
	}
</style>
