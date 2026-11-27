const configCache = {};

/**
 * Loads a configuration file from the server.
 * @param {string} name The name of the configuration file, prefixed with /eds/configs/
 *   and suffixed with .json
 * @returns {Promise<Object>} The configuration object
 */
export async function loadConfig(name) {
  if (!configCache[name]) {
    configCache[name] = fetch(`/eds/configs/${name}.json`)
      .then((resp) => resp.json())
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`Failed loading config: ${name}`, err);
        return {};
      });
  }

  return configCache[name];
}

/**
 * Loads the site configuration from the server.
 * @returns {Promise<Object>} The site configuration object
 */
export async function getSiteConfig() {
  return loadConfig('site-config');
}
