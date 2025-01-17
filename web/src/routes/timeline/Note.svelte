<script lang="ts" context="module">
	interface Window {
		// NIP-07
		nostr: any;
	}
	declare var window: Window;
</script>

<script lang="ts">
	import { Kind, nip19 } from 'nostr-tools';
	import {
		IconMessageCircle2,
		IconRepeat,
		IconQuote,
		IconHeart,
		IconPaw,
		IconCodeDots,
		IconBolt
	} from '@tabler/icons-svelte';
	import type { ChannelMetadata, Event } from '../types';
	import { reactionEmoji } from '../../stores/Preference';
	import { openNoteDialog, quotes, replyTo } from '../../stores/NoteDialog';
	import { recommendedRelay, readRelays, writeRelays } from '../../stores/Author';
	import { pool } from '../../stores/Pool';
	import { rom } from '../../stores/Author';
	import CreatedAt from '../CreatedAt.svelte';
	import { Api } from '$lib/Api';
	import { onMount } from 'svelte';
	import ZapDialog from '../ZapDialog.svelte';
	import Content from '../content/Content.svelte';
	export let event: Event;
	export let readonly: boolean;
	export let createdAtFormat: 'auto' | 'time' = 'auto';

	if ($rom) {
		readonly = true;
	}

	const iconSize = 20;

	let reposted = false;
	let reactioned = false;
	let zapped = false;
	let jsonDisplay = false;
	let replyToNames: string[] = [];
	let channelId: string | undefined;
	let channelName: string | undefined;
	let channelMetadata: ChannelMetadata | undefined;
	const originalEvent = Object.assign({}, event) as any;
	delete originalEvent.user;
	let zapDialogComponent: ZapDialog;

	let contentWarning = event.tags.find(([tagName]) => tagName === 'content-warning')?.at(1);
	let showContent = contentWarning === undefined;
	const showWarningContent = () => {
		showContent = true;
	};

	const toggleJsonDisplay = () => {
		jsonDisplay = !jsonDisplay;
	};

	function reply(event: Event) {
		$replyTo = event;
		$openNoteDialog = true;
	}

	async function repost(note: Event) {
		if ($rom) {
			console.error('Readonly');
			return;
		}

		reposted = true;

		const event = await window.nostr.signEvent({
			created_at: Math.round(Date.now() / 1000),
			kind: 6,
			tags: [
				['e', note.id, $recommendedRelay, 'mention'],
				['p', note.pubkey]
			],
			content: ''
		});
		console.log(event);

		$pool.publish($writeRelays, event).on('failed', () => {
			reposted = false;
		});
	}

	function quote(event: Event) {
		$quotes.push(event);
		$openNoteDialog = true;
	}

	async function reaction(note: Event) {
		console.log('[reaction]', note);

		if ($rom) {
			console.error('Readonly');
			return;
		}

		reactioned = true;

		const content = $reactionEmoji;

		const event = await window.nostr.signEvent({
			created_at: Math.round(Date.now() / 1000),
			kind: 7,
			tags: [
				['e', note.id],
				['p', note.pubkey]
			],
			content
		});
		console.log(event);

		$pool.publish($writeRelays, event).on('failed', () => {
			reactioned = false;
		});
	}

	function onZapped() {
		zapped = true;
	}

	onMount(async () => {
		const pubkeys = Array.from(
			new Set(event.tags.filter(([tagName]) => tagName === 'p').map(([, pubkey]) => pubkey))
		);
		const api = new Api($pool, $readRelays);
		const promises = pubkeys.map(async (pubkey) => {
			const userEvent = await api.fetchUserEvent(pubkey);
			return (
				userEvent?.user?.name ?? nip19.npubEncode(pubkey).substring(0, 'npub1'.length + 7)
			);
		});
		replyToNames = await Promise.all(promises);

		if (event.kind === Kind.ChannelMessage) {
			channelId = event.tags
				.find(([tagName, , , marker]) => tagName === 'e' && marker === 'root')
				?.at(1);
			if (channelId === undefined) {
				return;
			}
			const channelMetadataEvent = await api.fetchChannelMetadataEvent(channelId);
			if (channelMetadataEvent === undefined) {
				return;
			}
			channelMetadata = JSON.parse(channelMetadataEvent.content);
			channelName = channelMetadata?.name;
		}
	});
</script>

<article class="timeline-item">
	<ZapDialog {event} bind:this={zapDialogComponent} on:zapped={onZapped} />
	<div>
		<a href="/{nip19.npubEncode(event.pubkey)}">
			<img class="picture" src={event.user?.picture} alt="" />
		</a>
	</div>
	<div class="note">
		<div class="user">
			<div class="display_name">
				{event.user?.display_name ? event.user.display_name : event.user?.name}
			</div>
			<div class="name">@{event.user?.name}</div>
			<div class="created_at">
				<a href="/{nip19.noteEncode(event.id)}">
					<CreatedAt createdAt={event.created_at} format={createdAtFormat} />
				</a>
			</div>
		</div>
		{#if event.tags.some(([tagName]) => tagName === 'p')}
			<div class="reply">
				<span>To</span>
				<span>@{replyToNames.join(' @')}</span>
			</div>
		{/if}
		{#if !showContent}
			<div class="content-warning">
				<div>{contentWarning}</div>
				<button on:click={showWarningContent}>Show</button>
			</div>
		{:else}
			<Content {event} />
		{/if}
		{#if event.kind === Kind.ChannelMessage && channelId !== undefined}
			<div>
				<span>In</span>
				<span>
					<a
						href="https://garnet.nostrian.net/channels/{channelId}"
						target="_blank"
						rel="noopener noreferrer"
					>
						{channelName ?? 'GARNET'}
					</a>
				</span>
			</div>
		{/if}
		{#if !readonly}
			<div class="action-menu">
				<button class:hidden={event.kind === 42} on:click={() => reply(event)}>
					<IconMessageCircle2 size={iconSize} />
				</button>
				<button
					class="repost"
					class:hidden={event.kind === 42}
					disabled={reposted}
					on:click={() => repost(event)}
				>
					<IconRepeat size={iconSize} />
				</button>
				<button class:hidden={event.kind === 42} on:click={() => quote(event)}>
					<IconQuote size={iconSize} />
				</button>
				<button class="reaction" disabled={reactioned} on:click={() => reaction(event)}>
					{#if $reactionEmoji === '🐾'}
						<IconPaw size={iconSize} />
					{:else}
						<IconHeart size={iconSize} />
					{/if}
				</button>
				<button
					class="zap"
					class:hidden={event.user === undefined || event.user.zapEndpoint === null}
					disabled={zapped}
					on:click={() => zapDialogComponent.openZapDialog()}
				>
					<IconBolt size={iconSize} />
				</button>
				<button on:click={toggleJsonDisplay}>
					<IconCodeDots size={iconSize} />
				</button>
			</div>
		{/if}
		{#if jsonDisplay}
			<div class="develop">
				<h5>Note ID</h5>
				<div>{nip19.noteEncode(event.id)}</div>
				<div>{nip19.neventEncode({ id: event.id })}</div>
				<h5>Event JSON</h5>
				<pre><code class="json">{JSON.stringify(originalEvent, null, 2)}</code></pre>
				<h5>User JSON</h5>
				<pre><code class="json">{JSON.stringify(event.user, null, 2)}</code></pre>
			</div>
		{/if}
	</div>
</article>

<style>
	article {
		display: flex;
		flex-direction: row;
	}

	.picture {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		margin-right: 12px;
		object-fit: cover;
	}

	.note {
		color: rgb(15, 20, 25);
		font-size: 15px;
		font-weight: 400;
		width: calc(100% - 60px);

		/* Workaround for unnecessary space */
		display: flex;
		flex-direction: column;
	}

	.user {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
	}

	.display_name {
		margin-right: 4px;
		font-weight: 700;
	}

	.name {
		color: rgb(83, 100, 113);
		font-size: 15px;
	}

	.created_at {
		margin-left: auto;
	}

	.reply {
		font-size: 0.8em;
		color: gray;
	}

	.develop pre {
		background-color: #f6f8fa;
		padding: 0.5em;
		overflow: auto;
	}
	.develop .json {
		font-size: 0.8em;
	}

	.action-menu {
		display: flex;
		justify-content: space-between;
		margin-top: 12px;
	}

	.action-menu button {
		border: none;
		background-color: inherit;
		cursor: pointer;
		outline: none;
		padding: 0;
		color: lightgray;
		height: 20px;
	}

	.action-menu button.hidden {
		visibility: hidden;
	}

	.repost:disabled {
		color: lightgreen;
	}

	.reaction:disabled {
		color: lightpink;
	}

	.zap:disabled {
		color: #f59f00;
	}

	.content-warning {
		padding: 0.5em;
		width: 100%;
		height: 5em;
		background-color: lightgray;
	}
</style>
