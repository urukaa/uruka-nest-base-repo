import { registerAs } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { envList, optionalEnv } from 'src/common/env';

/**
 * Deliberately provider-agnostic. Clerk, Auth0, Supabase, Firebase, Cognito and
 * Keycloak all issue RS256 JWTs verified through a JWKS endpoint — swapping
 * between them is a change of configuration, not of code.
 *
 * Every value is optional: leaving JWKS_URL empty disables the external login
 * route entirely, the same way empty R2_* leaves object storage dormant.
 */
export default registerAs('externalAuth', () => {
  const provider = optionalEnv('AUTH_EXTERNAL_PROVIDER', AuthProvider.CLERK);

  if (!(provider in AuthProvider)) {
    throw new Error(
      `AUTH_EXTERNAL_PROVIDER must be one of ${Object.keys(AuthProvider).join(', ')}, got "${provider}"`,
    );
  }

  return {
    jwksUrl: optionalEnv('AUTH_EXTERNAL_JWKS_URL', ''),
    issuer: optionalEnv('AUTH_EXTERNAL_ISSUER', ''),

    /**
     * Clerk puts the calling origin in `azp` rather than `aud`, and leaving it
     * unchecked is what its docs call out as a CSRF risk. Providers that use
     * `aud` instead are covered by the field below; configure whichever your
     * provider actually issues.
     */
    authorizedParties: envList('AUTH_EXTERNAL_AUTHORIZED_PARTIES'),
    audience: optionalEnv('AUTH_EXTERNAL_AUDIENCE', ''),

    /**
     * A default Clerk session token carries only `sub` — email and name arrive
     * only if a JWT template is configured in the Clerk dashboard.
     */
    usernameClaim: optionalEnv('AUTH_EXTERNAL_USERNAME_CLAIM', 'email'),
    nameClaim: optionalEnv('AUTH_EXTERNAL_NAME_CLAIM', 'name'),

    provider: provider as AuthProvider,
  };
});
