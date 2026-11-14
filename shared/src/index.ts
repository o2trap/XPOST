/** Types and constants shared by the web app and the Worker. */

export const APP_NAME = 'xpost';
export const APP_VERSION = '0.1.0';

export const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'x', 'facebook', 'snapchat'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const isPlatform = (value: unknown): value is Platform =>
  typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);

export interface HealthResponse {
  ok: true;
  name: string;
  version: string;
}
