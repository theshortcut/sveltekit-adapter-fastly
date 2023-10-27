import { Server } from 'SERVER';
import { manifest, prerendered } from 'MANIFEST';
import { getServer } from 'STATICS';

const staticContentServer = getServer();
const server = new Server(manifest);

const app_path = `/${manifest.appPath}/`;

/**
 * @param {FetchEvent} event
 */
async function handleRequest(event) {
  await server.init({ env: {} });

  const url = new URL(event.request.url);

  // static assets
  if (url.pathname.startsWith(app_path)) {
    return await staticContentServer.serveRequest(event.request);
  }

  // prerendered pages and index.html files
  const pathname = url.pathname.replace(/\/$/, '');
  let file = pathname.substring(1);

  try {
    file = decodeURIComponent(file);
  } catch (err) {
    // ignore
  }

  if (
    manifest.assets.has(file) ||
    manifest.assets.has(file + '/index.html') ||
    prerendered.has(pathname || '/')
  ) {
    return await staticContentServer.serveRequest(event.request);
  }

  // dynamically-generated pages
  return await server.respond(event.request, {
    getClientAddress() {
      return event.request.headers.get('Fastly-Client-IP');
    },
  });
}

addEventListener('fetch', (event) => event.respondWith(handleRequest(event)));
