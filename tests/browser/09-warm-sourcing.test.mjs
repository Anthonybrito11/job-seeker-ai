/**
 * Empirical validation test for linkedin-warm-sourcing.js EXTRACT_JS.
 *
 * Validates that the extraction JavaScript (injected via playwright-cli eval)
 * correctly parses LinkedIn People search result DOM structure against a
 * fixture built from real LinkedIn DOM snapshots
 * (see .playwright-cli/page-2026-08-04T03-15-59-786Z.yml and
 *  .playwright-cli/page-2026-08-04T03-15-08-676Z.yml).
 *
 * This test uses playwright-cli via the browser.js wrapper (Gold Rule 10)
 * to open the fixture, run the EXTRACT_JS eval, and verify the output.
 *
 * Uses openAndEvalJSON with argument arrays, an isolated temporary workspace
 * and the shared Node fixture server on an ephemeral loopback port.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cleanup, TEST_WORKSPACE, TEST_ENV, ORIGIN, REPO_ROOT } from './helpers.mjs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
const FIXTURE_FILE = 'linkedin-people-search.html';
const FIXTURE_PATH = path.join(FIXTURE_DIR, FIXTURE_FILE);


// Import the module to get EXTRACT_JS, deriveRecruiterCategory, mapResultsToContacts.
// The script guards main() with require.main === module, so requiring is safe.
const { EXTRACT_JS, deriveRecruiterCategory, mapResultsToContacts } =
  require(path.join(REPO_ROOT, 'scripts', 'linkedin-warm-sourcing.js'));

// Import openAndEvalJSON from browser-helpers for reliable eval execution.
// The production helper preserves multiline eval code without shell quoting.
const { openAndEvalJSON, gotoAndEvalJSON } = require(path.join(REPO_ROOT, 'lib', 'browser-helpers'));

function extractFromFixture() {
  // Existing sessions are reused inside this test file's temporary workspace.
  return openAndEvalJSON(
    `${ORIGIN}/${FIXTURE_FILE}`,
    EXTRACT_JS,
    { timeout: 60000, headed: false, cwd: TEST_WORKSPACE, env: TEST_ENV }
  );
}

describe('linkedin-warm-sourcing.js: deriveRecruiterCategory (unit)', () => {
  it('classifies people-management roles as hiring_manager', () => {
    expect(deriveRecruiterCategory('Engineering Manager at Stripe')).toBe('hiring_manager');
    expect(deriveRecruiterCategory('Director of Engineering at Google')).toBe('hiring_manager');
    expect(deriveRecruiterCategory('VP of Engineering at Meta')).toBe('hiring_manager');
    expect(deriveRecruiterCategory('Head of Data at Stripe')).toBe('hiring_manager');
    expect(deriveRecruiterCategory('Hiring Manager at Stripe')).toBe('hiring_manager');
  });

  it('does NOT classify IC roles as hiring_manager', () => {
    expect(deriveRecruiterCategory('Staff Engineer at Stripe')).toBe('recruiter');
    expect(deriveRecruiterCategory('Lead Engineer at Google')).toBe('recruiter');
    expect(deriveRecruiterCategory('Principal Engineer at Meta')).toBe('recruiter');
    expect(deriveRecruiterCategory('Senior Engineer at Stripe')).toBe('recruiter');
  });

  it('classifies recruiter/talent roles as recruiter', () => {
    expect(deriveRecruiterCategory('Senior Technical Recruiter at Stripe')).toBe('recruiter');
    expect(deriveRecruiterCategory('Talent Acquisition at Meta')).toBe('recruiter');
    expect(deriveRecruiterCategory('Sourcer at Google')).toBe('recruiter');
  });
});

describe('linkedin-warm-sourcing.js: EXTRACT_JS empirical validation via playwright-cli', () => {
  beforeAll(async () => {
    // Verify fixture exists
    expect(fs.existsSync(FIXTURE_PATH)).toBe(true);
    // Clean up any stale browser sessions
    cleanup();
    // The global setup owns the local-only Node fixture server.
  }, 30000);

  afterAll(() => {
    cleanup();
  });

  it('EXTRACT_JS is a non-empty string', () => {
    expect(typeof EXTRACT_JS).toBe('string');
    expect(EXTRACT_JS.length).toBeGreaterThan(100);
  });

  it('EXTRACT_JS extracts 4 contacts from fixture (filters out non-profile listitem)', () => {
    const results = extractFromFixture();
    expect(results).not.toBeNull();
    expect(Array.isArray(results)).toBe(true);
    // 4 profile listitems + 1 navigation listitem (filtered out by vanity+name check)
    expect(results.length).toBe(4);
  }, 90000);

  it('EXTRACT_JS extracts correct name, vanity, title, degree, profile_url', () => {
    const results = extractFromFixture();
    expect(results).not.toBeNull();

    const jane = results.find((r) => r.vanity === 'jane-doe');
    expect(jane).toBeDefined();
    expect(jane.name).toBe('Jane Doe');
    expect(jane.title).toBe('Staff Engineer at Stripe');
    expect(jane.connection_degree).toBe('2nd');
    expect(jane.profile_url).toBe('https://www.linkedin.com/in/jane-doe/');

    const john = results.find((r) => r.vanity === 'john-smith');
    expect(john).toBeDefined();
    expect(john.name).toBe('John Smith');
    expect(john.title).toBe('Senior Technical Recruiter at Stripe');
    expect(john.connection_degree).toBe('3rd+');

    const alice = results.find((r) => r.vanity === 'alice-wonder');
    expect(alice).toBeDefined();
    expect(alice.name).toBe('Alice Wonder');
    expect(alice.title).toBe('Engineering Manager at Stripe');
    expect(alice.connection_degree).toBe('1st');
  }, 90000);

  it('EXTRACT_JS handles missing degree marker (empty string, not fabricated)', () => {
    const results = extractFromFixture();
    expect(results).not.toBeNull();

    const bob = results.find((r) => r.vanity === 'bob-builder');
    expect(bob).toBeDefined();
    expect(bob.name).toBe('Bob Builder');
    expect(bob.title).toBe('Director of Engineering at Stripe');
    // Degree should be empty string when no marker is present (not fabricated as '2nd')
    expect(bob.connection_degree).toBe('');
  }, 90000);

  it('EXTRACT_JS filters out navigation listitems (no /in/ profile link)', () => {
    const results = extractFromFixture();
    expect(results).not.toBeNull();
    // The "For Business" button listitem should be filtered out
    const nonProfile = results.find((r) => !r.vanity || !r.name);
    expect(nonProfile).toBeUndefined();
  }, 90000);

  it('preserves multiline JavaScript, quotes and Unicode without a shell', () => {
    const synthetic = { text: `O'Neil: "mañana" $HOME & | < >`, rows: ['one', 'two'] };
    const code = `() => {\n const value = ${JSON.stringify(synthetic)};\n return JSON.stringify(value);\n}`;
    expect(openAndEvalJSON(`${ORIGIN}/${FIXTURE_FILE}`, code, {
      cwd: TEST_WORKSPACE, env: TEST_ENV,
    })).toEqual(synthetic);
  });

  it('gotoAndEvalJSON executes against the same isolated workspace', () => {
    expect(gotoAndEvalJSON(`${ORIGIN}/${FIXTURE_FILE}`, '() => JSON.stringify({ title: document.title })', {
      cwd: TEST_WORKSPACE, env: TEST_ENV,
    })).toEqual({ title: 'LinkedIn People Search Fixture' });
  });

  it('preserves a JSON scalar string without requiring double encoding', () => {
    expect(gotoAndEvalJSON(`${ORIGIN}/${FIXTURE_FILE}`, "() => 'synthetic scalar'", {
      cwd: TEST_WORKSPACE, env: TEST_ENV,
    })).toBe('synthetic scalar');
  });
});

describe('linkedin-warm-sourcing.js: mapResultsToContacts (unit)', () => {
  it('maps raw extraction results to contact objects with category and company', () => {
    const raw = [
      { name: 'Jane Doe', vanity: 'jane-doe', title: 'Staff Engineer at Stripe', connection_degree: '2nd', profile_url: 'https://www.linkedin.com/in/jane-doe/' },
      { name: 'John Smith', vanity: 'john-smith', title: 'Senior Technical Recruiter at Stripe', connection_degree: '3rd+', profile_url: 'https://www.linkedin.com/in/john-smith/' },
    ];
    const contacts = mapResultsToContacts(raw, 'recruiter', 'Stripe');
    expect(contacts.length).toBe(2);
    expect(contacts[0].company).toBe('Stripe');
    expect(contacts[0].category).toBe('recruiter'); // Staff Engineer -> recruiter (not hiring_manager)
    expect(contacts[1].category).toBe('recruiter');
  });

  it('preserves search category for alumni/ex_colleague (does not derive from title)', () => {
    const raw = [
      { name: 'Jane Doe', vanity: 'jane-doe', title: 'Engineer at Stripe', connection_degree: '2nd' },
    ];
    const contacts = mapResultsToContacts(raw, 'alumni', 'Stripe');
    expect(contacts[0].category).toBe('alumni');
  });

  it('uses empty string for missing connection_degree (not fabricated default)', () => {
    const raw = [
      { name: 'Jane Doe', vanity: 'jane-doe', title: 'Engineer at Stripe', connection_degree: '', profile_url: '' },
    ];
    const contacts = mapResultsToContacts(raw, 'alumni', 'Stripe');
    expect(contacts[0].connection_degree).toBe('');
  });

  it('returns empty array for null input', () => {
    expect(mapResultsToContacts(null, 'recruiter', 'Stripe')).toEqual([]);
  });
});
