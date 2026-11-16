async function readSettings(client) {
  const { rows } = await client.query('SELECT key, numeric_value FROM business_settings');
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.numeric_value)]));
}

async function setSetting(client, req, key, value) {
  await client.query(
    `INSERT INTO business_settings (key, numeric_value, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET numeric_value = EXCLUDED.numeric_value,
       updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [key, value, req.user.email]
  );
}

module.exports = { readSettings, setSetting };
