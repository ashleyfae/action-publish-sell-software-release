#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ============================================================================
// PART 1: Environment Variable Validation
// ============================================================================

function validateEnvironment() {
  const required = {
    SOFTWARE_API_BASE_URL: 'Software platform API base URL',
    SOFTWARE_API_TOKEN: 'Software platform Sanctum API token',
    ASSET_URL: 'Release asset URL',
    FILE_NAME: 'Release file name',
    RELEASE_VERSION: 'Release version',
    RELEASABLE_TYPE: 'Releasable type (e.g. "product")',
    RELEASABLE_ID: 'Releasable record ID',
    GIT_REPO: 'GitHub repository (owner/repo)',
  };

  const missing = [];
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`${key} (${description})`);
    }
  }

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(item => console.error(`  - ${item}`));
    process.exit(1);
  }
}

// ============================================================================
// PART 2: Requirements Parsing from readme.txt
// ============================================================================

function parseRequirements(readmeFilePath) {
  if (!readmeFilePath || !fs.existsSync(readmeFilePath)) {
    console.log('No readme file found; no requirements to parse.');
    return null;
  }

  try {
    console.log(`Parsing requirements from ${readmeFilePath}`);
    const content = fs.readFileSync(readmeFilePath, 'utf-8');
    const requirements = [];

    // Parse "Requires at least: X.X" for WordPress version
    const wpMatch = content.match(/^Requires at least:\s*(.+)$/im);
    if (wpMatch) {
      requirements.push({ name: 'wp', version: wpMatch[1].trim() });
    }

    // Parse "Requires PHP: X.X" for PHP version
    const phpMatch = content.match(/^Requires PHP:\s*(.+)$/im);
    if (phpMatch) {
      requirements.push({ name: 'php', version: phpMatch[1].trim() });
    }

    if (requirements.length === 0) {
      console.log('No requirements found in readme.txt');
      return null;
    }

    console.log('Found requirements:', requirements);
    return requirements;
  } catch (error) {
    console.error(`Error parsing requirements: ${error.message}`);
    return null;
  }
}

// ============================================================================
// PART 3: Changelog Parsing
// ============================================================================

function parseChangelog(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.log(`No readme file found at ${filePath || 'undefined'}`);
    return '';
  }

  try {
    console.log(`Parsing changelog from ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find "== Changelog ==" section
    const changelogMatch = content.match(/^==\s*Changelog\s*==/im);
    if (!changelogMatch) {
      console.warn('No changelog section found in readme.txt');
      return '';
    }

    // Extract changelog section
    const startIndex = changelogMatch.index + changelogMatch[0].length;
    const remainingContent = content.substring(startIndex);
    const nextSectionMatch = remainingContent.match(/^==/m);
    const changelogText = nextSectionMatch
      ? remainingContent.substring(0, nextSectionMatch.index)
      : remainingContent;

    // Find first version block
    const versionBlockRegex = /\*\*([^*]+)\*\*[^\n]*\n([\s\S]*?)(?=\n\*\*|$)/;
    const match = changelogText.match(versionBlockRegex);

    if (!match) {
      console.warn('No version entries found in changelog');
      return '';
    }

    const changeItems = match[2].trim();
    console.log('Parsed changelog items: ', changeItems);

    // Extract bullet points and convert to HTML
    const lines = changeItems.split('\n');
    const bulletPoints = lines
      .map(line => line.trim())
      .filter(line => line.startsWith('*') || line.startsWith('-'))
      .map(line => line.substring(1).trim())
      .filter(line => line.length > 0);

    if (bulletPoints.length === 0) {
      console.warn('No bullet points found. Lines: ', lines);
      return '';
    }

    return '<ul>\n' +
      bulletPoints.map(item => `  <li>${escapeHtml(item)}</li>`).join('\n') +
      '\n</ul>';

  } catch (error) {
    console.error(`Error parsing changelog: ${error.message}`);
    return '';
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// PART 4: API Request
// ============================================================================

function makeApiRequest(data, token, baseUrl) {
  return new Promise((resolve, reject) => {
    const endpoint = baseUrl.replace(/\/$/, '') + '/api/releases';
    const parsed = new URL(endpoint);
    const protocol = parsed.protocol === 'https:' ? https : http;

    const payload = JSON.stringify(data);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Authorization': `Bearer ${token}`,
      }
    };

    const req = protocol.request(options, (res) => {
      let body = '';

      console.log('\n=== API Response ===');
      console.log('Status code:', res.statusCode);

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(body);
            resolve(json);
          } catch (error) {
            console.log('Response body:', body);
            console.log('====================\n');
            reject(new Error(`Failed to parse API response: ${error.message}`));
          }
        } else {
          console.log('Response body:', body);
          console.log('====================\n');
          reject(new Error(`API request failed with status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`API request error: ${error.message}`));
    });

    req.write(payload);
    req.end();
  });
}

// ============================================================================
// PART 5: Main Execution
// ============================================================================

async function main() {
  try {
    validateEnvironment();

    const requirements = parseRequirements(process.env.README_FILE);
    const notes = parseChangelog(process.env.README_FILE);

    const requestData = {
      releasable_type: process.env.RELEASABLE_TYPE,
      releasable_id: parseInt(process.env.RELEASABLE_ID, 10),
      git_repo: process.env.GIT_REPO,
      git_tag: process.env.RELEASE_VERSION,
      git_asset_url: process.env.ASSET_URL,
      notes: notes || null,
      pre_release: process.env.PRE_RELEASE === 'true',
    };

    if (requirements) {
      requestData.requirements = requirements;
    }

    console.log(`\nVersion ${process.env.RELEASE_VERSION} requirements:`, requirements || 'none');
    console.log(`Deploying asset: ${process.env.ASSET_URL}\n`);

    const response = await makeApiRequest(
      requestData,
      process.env.SOFTWARE_API_TOKEN,
      process.env.SOFTWARE_API_BASE_URL
    );

    console.log('API response:', JSON.stringify(response, null, 2));

    if (!response.id || response.id === null) {
      console.error('No release ID in response.');
      process.exit(1);
    }

    console.log(`\nSuccessfully created release #${response.id}`);
    process.exit(0);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[2] === 'test-changelog') {
  const testFile = process.argv[3] || 'readme.txt';
  console.log('Testing changelog parsing with:', testFile);
  const result = parseChangelog(testFile);
  console.log('\n=== Parsed Changelog HTML ===');
  console.log(result);
  console.log('=============================\n');
} else {
  main();
}
