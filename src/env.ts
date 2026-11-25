import { defineEnvVars } from '@sveltejs/kit/env';

// Read at startup; optional here because the code that uses each one throws a specific error when unset.
const optional = { schema: (input: string | undefined) => input };

export const variables = defineEnvVars({
	ADMIN_PASSWORD: optional,
	SESSION_SECRET: optional,
	DATABASE_URL: optional,
	OPERATOR_NAME: optional,
	OPERATOR_ADDRESS: optional,
	OPERATOR_EMAIL: optional
});
