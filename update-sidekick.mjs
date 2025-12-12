// update-sidekick-config.mjs
//
// Usage:
//   GITHUB_TOKEN=ghp_xxx node update-sidekick-config.mjs
//
// This script:
// 1. Reads tools/sidekick/config.json from sudo-buddy/wgw2025
// 2. Ensures/updates plugins in the SidekickConfig
// 3. Commits the updated config back to GitHub

const OWNER = 'sudo-buddy';
const REPO = 'wgw2025';
const PATH = 'tools/sidekick/config.json';

// 1) Define the plugin(s) you want to ensure exist in the config
const PLUGINS_TO_ENSURE = [
  {
    id: 'experimentation',
    title: 'A/B Testing',
    environments: ['dev', 'edit', 'admin', 'preview', 'live', 'prod'],
    event: 'experimentation',
  },
  // Add more plugins here if needed
];

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('ERROR: Please set GITHUB_TOKEN env var with a token that has access to the repo.');
  process.exit(1);
}

const GH_API_BASE = 'https://api.github.com';

async function githubRequest(path, options = {}) {
  const url = `${GH_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sidekick-config-updater',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status} ${res.statusText} for ${url}:\n${text}`);
  }

  return res.json();
}

function ensurePlugins(config) {
  if (!config.plugins || !Array.isArray(config.plugins)) {
    config.plugins = [];
  }

  PLUGINS_TO_ENSURE.forEach((pluginToEnsure) => {
    const idx = config.plugins.findIndex((p) => p.id === pluginToEnsure.id);
    if (idx === -1) {
      // Add new plugin
      config.plugins.push(pluginToEnsure);
      console.log(`Added plugin: ${pluginToEnsure.id}`);
    } else {
      // Fully replace existing plugin with the latest definition
      config.plugins[idx] = {
        ...pluginToEnsure,
      };
      console.log(`Replaced plugin: ${pluginToEnsure.id}`);
    }
  });

  return config;
}

function encodeContent(json) {
  const pretty = JSON.stringify(json, null, 2);
  return Buffer.from(pretty, 'utf8').toString('base64');
}

async function main() {
  console.log(`Fetching current Sidekick config from ${OWNER}/${REPO}/${PATH}...`);

  // 1) GET current file
  const file = await githubRequest(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}`);
  const { content, sha } = file;

  const decoded = Buffer.from(content, 'base64').toString('utf8');
  let config;
  try {
    config = JSON.parse(decoded);
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${PATH}: ${e.message}`);
  }

  console.log('Current config loaded:');
  console.log(JSON.stringify(config, null, 2));

  // 2) Ensure plugins according to SidekickConfig schema
  const updatedConfig = ensurePlugins(config);

  // If nothing changed, you can early exit (optional)
  const updatedContent = JSON.stringify(updatedConfig, null, 2);
  if (updatedContent === JSON.stringify(config, null, 2)) {
    console.log('No changes to apply. Exiting.');
    return;
  }

  // 3) PUT updated file back to GitHub
  const newBase64 = encodeContent(updatedConfig);

  console.log('Committing updated config back to GitHub...');

  const commitMessage = 'chore: update Sidekick plugins via script';

  const updateRes = await githubRequest(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(PATH)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: commitMessage,
      content: newBase64,
      sha,
    }),
  });

  console.log('Update successful. New file SHA:', updateRes.content.sha);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
