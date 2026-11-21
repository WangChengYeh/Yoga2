import { setupUpdater } from './update.js?v=0.6.1';
// Independent of the renderer, camera and speech modules so recovery remains
// available even when one of those features fails during startup.
setupUpdater({ document, location: window.location, fetch: window.fetch.bind(window) });
