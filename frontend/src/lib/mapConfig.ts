/**
 * Mapbox configuration.
 *
 * Lives outside the map component so non-component modules (and tests) can ask
 * whether a token is configured without importing React.
 */

export const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? '';

export function hasMapboxToken(): boolean {
  return MAPBOX_TOKEN.trim().length > 0;
}
