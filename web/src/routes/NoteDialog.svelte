<script lang="ts" context="module">
	interface Window {
		// NIP-07
		nostr: any;
	}
	declare var window: Window;
</script>

<script lang="ts">
	import { pool } from '../stores/Pool';
	import { pubkey, rom, recommendedRelay, writeRelays } from '../stores/Author';
	import { openNoteDialog, replyTo, quotes, intentContent } from '../stores/NoteDialog';
	import Note from './timeline/Note.svelte';
	import { IconSend } from '@tabler/icons-svelte';
	import { Api } from '$lib/Api';
	import { Content } from '$lib/Content';
	import { nip19 } from 'nostr-tools';
	import type { EventPointer, ProfilePointer } from 'nostr-tools/lib/nip19';
	import { userEvents } from '../stores/UserEvents';
	import type { UserEvent } from './types';

	let content = '';
	let posting = false;
	let dialog: HTMLDialogElement;
	let textarea: HTMLTextAreaElement;
	let pubkeys = new Set<string>();
	let complementStart = -1;
	let complementEnd = -1;
	let complementUserEvents: UserEvent[] = [];
	let customEmojis: string[][] = [
		['', ''],
		['', ''],
		['', ''],
		['', ''],
		['', '']
	];

	openNoteDialog.subscribe((open) => {
		console.log('[open]', open);
		if (open) {
			if ($quotes.length > 0) {
				content =
					'\n' + $quotes.map((event) => `nostr:${nip19.noteEncode(event.id)}`).join('\n');
			}
			// Wait for content updated
			setTimeout(() => {
				console.log(textarea, textarea.selectionStart);
				textarea.setSelectionRange(0, 0);
				dialog.showModal();
				textarea.focus();
			}, 10);
		}
	});

	intentContent.subscribe((value) => {
		console.log('[content override]');

		content = value;
		value = '';
	});

	function closeDialog(event: MouseEvent) {
		console.debug('[click]', `(${event.x}, ${event.y})`);

		const insideDialog =
			event.x >= dialog.offsetLeft &&
			event.x <= dialog.offsetLeft + dialog.offsetWidth &&
			event.y >= dialog.offsetTop &&
			event.y <= dialog.offsetTop + dialog.offsetHeight;

		if (!insideDialog) {
			dialog.close();
		}
	}

	async function closed(event: Event) {
		console.log(`[${event.type}]`);
		$openNoteDialog = false;
		content = '';
		pubkeys.clear();
		$replyTo = undefined;
		$quotes = [];
		exitComplement();
	}

	async function submitFromKeyboard(event: KeyboardEvent) {
		console.debug(`[${event.type}]`, event.code, event.key, event.ctrlKey, event.metaKey);
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
			await postNote();
		}
	}

	async function onInput(inputEvent: Event) {
		const { selectionStart, selectionEnd } = textarea;
		console.debug(
			'[complement input]',
			inputEvent,
			content,
			complementStart,
			selectionStart,
			selectionEnd
		);
		if (!(inputEvent instanceof InputEvent)) {
			console.warn('[complement input type]', typeof inputEvent);
			return;
		}

		if (
			selectionStart === selectionEnd &&
			selectionStart > 0 &&
			content.lastIndexOf('@', selectionStart) >= 0
		) {
			complementStart = content.lastIndexOf('@', selectionStart);
		} else if (content.lastIndexOf('@', selectionStart) < 0) {
			exitComplement();
		}

		if (complementStart >= 0) {
			complementEnd = selectionEnd;
			const complementName = content.slice(complementStart + 1, selectionStart).toLowerCase();
			const max = 5;
			complementUserEvents = [...$userEvents]
				.filter(
					([, e]) =>
						e.user?.name?.toLowerCase().startsWith(complementName) ||
						e.user?.display_name?.toLowerCase().startsWith(complementName)
				)
				.map(([, e]) => e)
				.slice(0, max);
			if (complementUserEvents.length < max) {
				complementUserEvents.push(
					...[...$userEvents]
						.filter(
							([, e]) =>
								e.user?.name?.toLowerCase().includes(complementName) ||
								e.user?.display_name?.toLowerCase().includes(complementName)
						)
						.filter(([p]) => !complementUserEvents.some((x) => x.pubkey === p))
						.map(([, e]) => e)
						.slice(0, max - complementUserEvents.length)
				);
			}
			if (complementUserEvents.length < max) {
				// TODO: fetch
			}
			console.debug(
				'[complement]',
				complementName,
				complementUserEvents.map((x) => `@${x.user.name}, ${x.pubkey}`)
			);

			// Exit if not found
			if (complementUserEvents.length === 0) {
				exitComplement();
			}
		}
	}

	function replaceComplement(event: UserEvent) {
		console.debug('[replace complement]', content, complementStart, complementEnd);
		const beforeCursor =
			content.substring(0, complementStart) +
			(complementStart === 0 || content.at(complementStart - 1) === ' ' ? '' : ' ') +
			`nostr:${nip19.npubEncode(event.pubkey)} `;
		const afterCursor = content.substring(
			content.at(complementEnd) === ' ' ? complementEnd + 1 : complementEnd
		);
		content = beforeCursor + afterCursor;
		const cursor = beforeCursor.length;
		console.debug('[replaced complement]', content, cursor);
		exitComplement();
		textarea.setSelectionRange(cursor, cursor);
		textarea.focus();
	}

	function exitComplement() {
		complementStart = -1;
		complementEnd = -1;
		complementUserEvents = [];
	}

	async function postNote() {
		if (content === '') {
			console.log('Content is empty');
			return;
		}

		if ($rom) {
			console.error('Readonly');
			return;
		}

		let tags: string[][] = [];
		if ($replyTo !== undefined) {
			if ($replyTo.tags.filter((x) => x[0] === 'e').length === 0) {
				// root
				tags.push(['e', $replyTo.id, '', 'root']);
			} else {
				// reply
				tags.push(['e', $replyTo.id, '', 'reply']);
				const root = $replyTo.tags.find(
					([tagName, , , marker]) => tagName === 'e' && marker === 'root'
				);
				if (root !== undefined) {
					tags.push(['e', root[1], '', 'root']);
				}
			}
			pubkeys = new Set([
				$replyTo.pubkey,
				...$replyTo.tags.filter((x) => x[0] === 'p').map((x) => x[1])
			]);
		}

		const eventIds = Content.findNotesAndNevents(content)
			.map((x) => {
				try {
					const { type, data } = nip19.decode(x);
					switch (type) {
						case 'note':
							return data as string;
						case 'nevent':
							return (data as EventPointer).id;
						default:
							return undefined;
					}
				} catch {
					return undefined;
				}
			})
			.filter((x): x is string => x !== undefined);
		tags.push(
			...Array.from(new Set(eventIds)).map((eventId) => [
				'e',
				eventId,
				$recommendedRelay,
				'mention'
			])
		);

		for (const { type, data } of Content.findNpubsAndNprofiles(content).map((x) => {
			try {
				return nip19.decode(x);
			} catch {
				return { type: undefined, data: undefined };
			}
		})) {
			switch (type) {
				case 'npub': {
					pubkeys.add(data as string);
					break;
				}
				case 'nprofile': {
					pubkeys.add((data as ProfilePointer).pubkey);
				}
			}
		}
		tags.push(...Array.from(pubkeys).map((pubkey) => ['p', pubkey]));

		const hashtags = Content.findHashtags(content);
		tags.push(...Array.from(hashtags).map((hashtag) => ['t', hashtag]));

		tags.push(
			...Array.from(
				new Set(
					customEmojis
						.filter(([shortcode, url]) => {
							if (shortcode === undefined || shortcode === '') {
								return false;
							}

							if (url === undefined || url === '') {
								return false;
							}

							if (!content.includes(shortcode)) {
								return false;
							}

							try {
								new URL(url.trim());
								return true;
							} catch (error) {
								console.log('[invalid emoji url]', url);
								return false;
							}
						})
						.map(([shortcode, url]) => {
							if (shortcode.at(0) === ':') {
								shortcode = shortcode.substring(1);
							}
							if (shortcode.at(shortcode.length - 1) === ':') {
								shortcode = shortcode.substring(0, shortcode.length - 1);
							}
							return ['emoji', shortcode, url.trim()];
						})
				)
			)
		);

		posting = true;
		const event = await window.nostr.signEvent({
			created_at: Math.round(Date.now() / 1000),
			kind: 1,
			tags,
			content: Content.replaceNip19(content)
		});
		console.log('[publish]', event);

		const api = new Api($pool, $writeRelays);
		const success = await api.publish(event);
		posting = false;
		if (success) {
			console.log('[success]');
			dialog.close();
		} else {
			console.error('[failure]');
		}
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<dialog bind:this={dialog} on:click={closeDialog} on:close={closed}>
	{#if $replyTo}
		<Note event={$replyTo} readonly={true} />
	{/if}
	<form on:submit|preventDefault={postNote}>
		<textarea
			placeholder="いまどうしてる？"
			bind:value={content}
			bind:this={textarea}
			on:keydown={submitFromKeyboard}
			on:input={onInput}
		/>
		<input id="send" type="submit" disabled={!pubkey || posting} />
		<label for="send"><IconSend size={30} /></label>
	</form>
	{#if $quotes.length > 0}
		{#each $quotes as quote}
			<Note event={quote} readonly={true} />
		{/each}
	{/if}
	{#if complementStart >= 0}
		<ul>
			{#each complementUserEvents as event}
				<li on:click|stopPropagation={() => replaceComplement(event)}>
					<span>{event.user.display_name ?? ''}</span>
					<span>@{event.user.name ?? event.user.display_name}</span>
				</li>
			{/each}
		</ul>
	{/if}
	<details>
		<summary>Define Custom Emoji (temporary)</summary>
		{#each customEmojis as [shortcode, url]}
			<div>
				<input type="text" placeholder=":shortcode:" bind:value={shortcode} />
				<input type="text" placeholder="URL" bind:value={url} />
			</div>
		{/each}
	</details>
</dialog>

<style>
	dialog {
		border: 1px;
		border-style: solid;
		border-color: lightgray;
		border-radius: 10px;
		max-width: 100%;
		margin: 0 auto;
		z-index: 1;
		width: 50%;
	}

	textarea {
		width: 100%;
		height: 4em;
	}

	label {
		display: block;
		margin-left: auto;
		width: 30px;
	}

	input[type='submit'] {
		display: none;
	}

	input[type='submit']:disabled + label {
		color: lightgray;
	}

	ul {
		list-style: none;
		padding: 0;
	}
</style>
