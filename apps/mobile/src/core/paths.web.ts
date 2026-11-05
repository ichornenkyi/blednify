/** The web app stores no files: every track URI is already absolute, so these are identities. */
export const absUri = (rel: string): string => rel;
export const relUri = (uri: string): string => uri;
