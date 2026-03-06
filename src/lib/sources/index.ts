export * from './types';
export { providerRegistry } from './provider-registry';
export { normalizeYouTubeVideo } from './normalize';
export { youtubeProvider } from './youtube-provider';
export { xProvider } from './x-provider';

// Register built-in providers (runs once due to ES module caching)
import { providerRegistry } from './provider-registry';
import { youtubeProvider } from './youtube-provider';
import { xProvider } from './x-provider';

providerRegistry.register(youtubeProvider);
providerRegistry.register(xProvider);
