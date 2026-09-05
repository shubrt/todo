import type { AuthConfig } from "convex/server";

const issuer = process.env.AUTH_JWT_ISSUER;

export default {
  providers: issuer
    ? [
        {
          type: "customJwt",
          issuer,
          applicationID: "todo",
          algorithm: "ES256",
          jwks: `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`,
        },
      ]
    : [],
} satisfies AuthConfig;
