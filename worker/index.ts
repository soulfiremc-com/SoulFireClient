// Cloudflare serves existing files and index.html for page loads itself.
// Only other requests for missing files reach this Worker, such as chunks
// from an older deploy, so they get a real 404 instead of the app shell.
export default {
  fetch: () => new Response("Not found", { status: 404 }),
};
