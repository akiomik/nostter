import { get, writable, type Writable } from 'svelte/store';
import type { User } from '../routes/types';
import type { Event } from 'nostr-tools';
import { defaultRelays } from './DefaultRelays';

const $defaultRelays = get(defaultRelays);
export const pubkey = writable('');
export const authorProfile: Writable<User> = writable();
export const recommendedRelay = writable('');
export const followees: Writable<string[]> = writable([]);
export const mutePubkeys: Writable<string[]> = writable([]);
export const muteEventIds: Writable<string[]> = writable([]);
export const pinNotes: Writable<string[]> = writable([]);
export const readRelays: Writable<string[]> = writable($defaultRelays);
export const writeRelays: Writable<string[]> = writable($defaultRelays);
export const rom = writable(false);

export const isMutePubkey = (pubkey: string) => get(mutePubkeys).includes(pubkey);
export const isMuteEvent = (event: Event) => {
	if (
		isMutePubkey(event.pubkey) ||
		event.tags.some(([tagName, pubkey]) => tagName === 'p' && isMutePubkey(pubkey))
	) {
		return true;
	}

	const ids = get(muteEventIds);
	return (
		ids.includes(event.id) ||
		event.tags.some(([tagName, id]) => tagName === 'e' && ids.includes(id))
	);
};

export const updateRelays = (event: Event) => {
	const validRelayTags = event.tags.filter(([t, relay]) => {
		if (t !== 'r') {
			return false;
		}

		try {
			const url = new URL(relay);
			return url.protocol === 'wss:' || url.protocol === 'ws:';
		} catch {
			return false;
		}
	});
	readRelays.set(
		Array.from(
			new Set(
				validRelayTags
					.filter(([, , permission]) => permission === undefined || permission === 'read')
					.map(([, relay]) => relay)
			)
		)
	);
	writeRelays.set(
		Array.from(
			new Set(
				validRelayTags
					.filter(
						([, , permission]) => permission === undefined || permission === 'write'
					)
					.map(([, relay]) => relay)
			)
		)
	);
};
