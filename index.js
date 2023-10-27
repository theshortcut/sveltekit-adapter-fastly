import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import toml from '@iarna/toml';

/**
 * @typedef {{
 *   name: string;
 * }} FastlyToml
 */

/** @type {import('.').default} */
export default function ({ config = 'fastly.toml' } = {}) {
  return {
    name: 'sveltekit-adapter-fastly',

    async adapt(builder) {
      const { name, ...fastly_toml } = validate_config(builder, config);

      // Clear out the build directory
      const files = fileURLToPath(new URL('./files', import.meta.url).href);
      const tmp = builder.getBuildDirectory('compute-tmp');

      builder.log.info('Clearing out the build directory...');
      builder.rimraf(tmp);

      builder.log.info('Installing compute depencencies...');
      builder.copy(`${files}/_package.json`, `${tmp}/package.json`);
      let stdout = execSync('npm install', { cwd: tmp });
      builder.log.info(stdout.toString());

      builder.log.minor('Generating compute entry point...');
      const relativePath = posix.relative(
        `${tmp}/src`,
        builder.getServerDirectory(),
      );
      builder.copy(`${files}/index.js`, `${tmp}/src/index.js`, {
        replace: {
          SERVER: `${relativePath}/index.js`,
          MANIFEST: './manifest.js',
          STATICS: './statics.js',
        },
      });

      writeFileSync(
        `${tmp}/src/manifest.js`,
        `export const manifest = ${builder.generateManifest({
          relativePath,
        })};\n\nexport const prerendered = new Map(${JSON.stringify(
          Array.from(builder.prerendered.pages.entries()),
        )});\n`,
      );

      builder.log.minor('Generating fastly.toml...');
      const fastly_toml_final = {
        manifest_version: 3,
        language: 'javascript',
        name,
        scripts: {
          build: 'npm run build',
        },
        ...fastly_toml,
      };
      writeFileSync(`${tmp}/fastly.toml`, toml.stringify(fastly_toml_final));

      builder.log.info('Copying assets...');
      builder.copy(
        `${files}/static-publish.rc.js`,
        `${tmp}/static-publish.rc.js`,
      );
      builder.writeClient(`${tmp}/src/assets`);
      builder.writePrerendered(`${tmp}/src/assets`);

      builder.log.info('Building with fastly cli...');
      stdout = execSync('fastly compute build', { cwd: tmp });
      builder.log.info(stdout.toString());

      // STEPS:
      // - Clear out the build directory
      // - Write SvelteKit output with builder.writeClient, builder.writeServer, and builder.writePrerendered
      // - Output code that:
      //   - Imports Server from ${builder.getServerDirectory()}/index.js
      //   - Instantiates the app with a manifest generated with builder.generateManifest({ relativePath })
      //   - Listens for requests from the platform, converts them to a standard Request if necessary, calls the server.respond(request, { getClientAddress }) function to generate a Response and responds with it
      //   - expose any platform-specific information to SvelteKit via the platform option passed to server.respond
      //   - Globally shims fetch to work on the target platform, if necessary. SvelteKit provides a @sveltejs/kit/node/polyfills helper for platforms that can use undici
      // - Bundle the output to avoid needing to install dependencies on the target platform, if necessary
      // - Put the user's static files and the generated JS/CSS in the correct location for the target platform
      // Where possible, we recommend putting the adapter output under the build/ directory with any intermediate output placed under .svelte-kit/[adapter-name]
    },
  };
}

/**
 * @param {import('@sveltejs/kit').Builder} builder
 * @param {string} config
 * @returns {FastlyToml}
 */
function validate_config(builder, config) {
  if (existsSync(config)) {
    /** @type {FastlyToml} */
    let fastly_toml;

    try {
      fastly_toml = /** @type {FastlyToml} */ (
        toml.parse(readFileSync(config, 'utf-8'))
      );
    } catch (err) {
      err.message = `Error parsing ${config}: ${err.message}`;
      throw err;
    }

    if (!fastly_toml.name) {
      throw new Error(
        `You must specify name option in ${config}. Consult https://github.com/sveltejs/kit/tree/master/packages/adapter-cloudflare-workers`,
      );
    }

    return fastly_toml;
  }

  builder.log.error(
    'Consult https://developer.fastly.com/reference/compute/fastly-toml on how to setup your site',
  );

  builder.log(
    `
		Sample fastly.toml:

    manifest_version = 3
    name = "my-compute-project"
    description = "A wonderful Compute project that adds edge computing goodness to my application architecture."
    authors = ["me@example.com"]`
      .replace(/^\t+/gm, '')
      .trim(),
  );

  throw new Error(`Missing a ${config} file`);
}
