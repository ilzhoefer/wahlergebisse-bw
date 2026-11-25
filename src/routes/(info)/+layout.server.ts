import { error } from '@sveltejs/kit';
import {
	OPERATOR_NAME as name,
	OPERATOR_ADDRESS as address,
	OPERATOR_EMAIL as email
} from '$app/env/private';
import type { LayoutServerLoad } from './$types';

/** Site operator for the Impressum and Datenschutzerklärung — read at runtime from the environment
 * so name and email stay out of the repo and the published image (see .env.example). */
export const load: LayoutServerLoad = () => {
	if (!name || !address || !email)
		error(500, 'OPERATOR_NAME, OPERATOR_ADDRESS and OPERATOR_EMAIL must be set');
	return {
		operator: {
			name,
			/** Comma-separated lines, e.g. "Musterstraße 1, 70567 Stuttgart". */
			address: address.split(',').map((line) => line.trim()),
			/** Base64 — ProtectedEmail decodes it only in the browser, keeping the plain address out of
			 * the served HTML. */
			emailBase64: Buffer.from(email).toString('base64')
		}
	};
};
