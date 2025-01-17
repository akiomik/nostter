<script lang="ts">
	import { IconBolt, IconCodeDots } from '@tabler/icons-svelte';
	import { pool } from '../../stores/Pool';
	import type { Event as NostrEvent } from '../types';
	import { readRelays } from '../../stores/Author';
	import { nip19, type Event } from 'nostr-tools';
	import CreatedAt from '../CreatedAt.svelte';
	import { onMount } from 'svelte';
	import { Api } from '$lib/Api';
	import NoteLink from './NoteLink.svelte';
	import EventComponent from './EventComponent.svelte';

	export let event: NostrEvent;
	export let readonly: boolean;
	export let createdAtFormat: 'auto' | 'time' = 'auto';

	let originalEvent: NostrEvent | undefined;
	let jsonDisplay = false;

	const originalTag = event.tags.find(
		(tag) =>
			tag.at(0) === 'e' && (tag.at(3) === 'mention' || tag.at(3) === 'root' || tag.length < 4)
	);

	const descriptionTag = event.tags.find(([tagName]) => tagName === 'description')?.at(1);
	console.debug('[zap request]', event.id, descriptionTag);
	let zapRequestEvent: Event | undefined;
	try {
		zapRequestEvent = JSON.parse(descriptionTag ?? '{}') as Event;
	} catch (error) {
		console.error('[invalid description tag]', error, descriptionTag);
	}

	const api = new Api($pool, $readRelays);

	onMount(async () => {
		if (originalTag !== undefined) {
			const eventId = originalTag[1];
			originalEvent = await api.fetchEventById(eventId);
		} else {
			console.warn('[zapped event not found]', event);
		}
	});

	const toggleJsonDisplay = () => {
		jsonDisplay = !jsonDisplay;
	};
</script>

<article class="timeline-item">
	<div class="user">
		<div>
			<IconBolt size={18} color={'#f59f00'} />
		</div>
		<div>by</div>
		{#if zapRequestEvent === undefined}
			<div>Unknown</div>
		{:else}
			{#await api.fetchUserEvent(zapRequestEvent.pubkey)}
				<div>@...</div>
			{:then zapUserEvent}
				<div>
					<a href="/{nip19.npubEncode((zapUserEvent ?? event).pubkey)}">
						@{(zapUserEvent ?? event).user?.name ??
							(zapUserEvent ?? event).pubkey.substring('npub1'.length + 7)}
					</a>
				</div>
			{/await}
		{/if}
		<div class="json-button">
			<button on:click={toggleJsonDisplay}>
				<IconCodeDots size={15} />
			</button>
		</div>
		<div class="created-at">
			<CreatedAt createdAt={event.created_at} format={createdAtFormat} />
		</div>
	</div>
	{#if zapRequestEvent !== undefined && zapRequestEvent.content}
		<div class="content">{zapRequestEvent.content}</div>
	{/if}
</article>
{#if jsonDisplay}
	<div class="develop">
		<h5>Event JSON</h5>
		<pre><code class="json">{JSON.stringify(event, null, 2)}</code></pre>
		<h5>Zap Request Event JSON</h5>
		<pre><code class="json">{JSON.stringify(zapRequestEvent, null, 2)}</code></pre>
		<h5>User JSON</h5>
		<pre><code class="json">{JSON.stringify(event.user, null, 2)}</code></pre>
	</div>
{/if}
{#if originalEvent !== undefined}
	<EventComponent event={originalEvent} {readonly} {createdAtFormat} />
{:else if originalTag !== undefined}
	<NoteLink eventId={originalTag[1]} />
{/if}

<style>
	.user {
		display: flex;
		flex-direction: row;
	}

	.user div {
		margin-right: 0.2em;
	}

	.content {
		margin: 0.5em;
	}

	.json-button {
		margin-left: auto;
	}

	button {
		border: none;
		background-color: inherit;
		cursor: pointer;
		outline: none;
		padding: 0;
		color: lightgray;
		height: 20px;
	}

	.develop pre {
		background-color: #f6f8fa;
		padding: 0.5em;
		overflow: auto;
	}
	.develop .json {
		font-size: 0.8em;
	}
</style>
