'use strict';
const ACTIVE_STAGES = [
  'discovered', 'contacted', 'applied', 'in_review',
  'screening', 'interview', 'offer', 'hired',
];
const CLOSED_STAGES = ['rejected', 'withdrawn', 'skipped'];

async function getDb(Client) {
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  await client.connect();
  return client;
}

async function fetchPipelineData(Client = require('pg').Client) {
  const userId = Number(process.env.USER_ID || 1);
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid user ID");
  const client = await getDb(Client);
  try {
    // Active applications by stage
    const { rows: active } = await client.query(`
      SELECT id, platform, company, role, url, status, applied_at,
             data->>'match' as match, data->>'source' as source,
             data->>'location' as location
      FROM applications
      WHERE user_id = $1 AND status = ANY($2)
      ORDER BY CASE
        WHEN status = 'offer' THEN 0
        WHEN status = 'interview' THEN 1
        WHEN status = 'screening' THEN 2
        WHEN status = 'in_review' THEN 3
        WHEN status = 'applied' THEN 4
        WHEN status = 'contacted' THEN 5
        WHEN status = 'discovered' THEN 6
      END, applied_at DESC
    `, [userId, ACTIVE_STAGES]);

    // Closed applications
    const { rows: closed } = await client.query(`
      SELECT id, platform, company, role, status, applied_at
      FROM applications
      WHERE user_id = $1 AND status = ANY($2)
      ORDER BY applied_at DESC
      LIMIT 20
    `, [userId, CLOSED_STAGES]);

    // Funnel counts
    const { rows: funnel } = await client.query(`
      SELECT status, count(*) as count
      FROM applications
      WHERE user_id = $1
      GROUP BY status
    `, [userId]);

    // Recent messages
    const { rows: messages } = await client.query(`
      SELECT id, channel, direction, sender, subject, status, received_at
      FROM messages
      WHERE user_id = $1
      ORDER BY COALESCE(received_at, sent_at) DESC
      LIMIT 10
    `, [userId]).catch(() => ({ rows: [] }));

    // Company registrations summary
    const { rows: targets } = await client.query(`
      SELECT registration_status, count(*) as count
      FROM company_registrations
      WHERE user_id = $1
      GROUP BY registration_status
    `, [userId]).catch(() => ({ rows: [] }));

    // Strategy
    const { rows: strategyRows } = await client.query(`
      SELECT data->'strategy' as strategy FROM users WHERE id = $1
    `, [userId]).catch(() => ({ rows: [] }));

    // User name
    const { rows: userRows } = await client.query(`
      SELECT name FROM users WHERE id = $1
    `, [userId]).catch(() => ({ rows: [{ name: '' }] }));

    // Last activity
    const { rows: lastActivity } = await client.query(`
      SELECT max(applied_at) as last_application FROM applications WHERE user_id = $1
    `, [userId]);

    return {
      active,
      closed,
      funnel: funnel.reduce((acc, r) => { acc[r.status] = parseInt(r.count); return acc; }, {}),
      messages,
      targets: targets.reduce((acc, r) => { acc[r.registration_status] = parseInt(r.count); return acc; }, {}),
      strategy: strategyRows[0]?.strategy || null,
      userName: userRows[0]?.name || '',
      lastApplication: lastActivity[0]?.last_application || null,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await client.end();
  }
}

module.exports = { fetchPipelineData };
