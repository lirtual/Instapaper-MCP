export interface Env {
  INSTAPAPER_CONSUMER_KEY: string;
  INSTAPAPER_CONSUMER_SECRET: string;
  INSTAPAPER_OAUTH_TOKEN: string;
  INSTAPAPER_OAUTH_TOKEN_SECRET: string;

  ACCESS_CLIENT_ID: string;
  ACCESS_CLIENT_SECRET: string;
  ACCESS_TOKEN_URL: string;
  ACCESS_AUTHORIZATION_URL: string;
  ACCESS_JWKS_URL: string;
  COOKIE_ENCRYPTION_KEY: string;
  ALLOWED_EMAIL?: string;

  OAUTH_KV: KVNamespace;
}

export function instapaperCredentialsFromEnv(env: Pick<Env,
  | "INSTAPAPER_CONSUMER_KEY"
  | "INSTAPAPER_CONSUMER_SECRET"
  | "INSTAPAPER_OAUTH_TOKEN"
  | "INSTAPAPER_OAUTH_TOKEN_SECRET"
>) {
  return {
    consumerKey: env.INSTAPAPER_CONSUMER_KEY,
    consumerSecret: env.INSTAPAPER_CONSUMER_SECRET,
    oauthToken: env.INSTAPAPER_OAUTH_TOKEN,
    oauthTokenSecret: env.INSTAPAPER_OAUTH_TOKEN_SECRET,
  };
}
