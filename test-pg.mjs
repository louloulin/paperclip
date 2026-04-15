import postgres from "postgres";

async function main() {
  const sql = postgres("postgres://paperclip:paperclip@127.0.0.1:54330/paperclip", {
    connect_timeout: 5,
    max: 5,
  });

  try {
    // Check column names
    const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'drizzle_schema_migrations' ORDER BY ordinal_position`;
    console.log("Columns:", columns.map(r => r.column_name));

    // Check the names
    const names = await sql`SELECT id, name FROM drizzle_schema_migrations ORDER BY id LIMIT 5`;
    console.log("\nFirst 5 rows:", names);

    const count = await sql`SELECT COUNT(*) as c FROM drizzle_schema_migrations`;
    console.log("Total:", count[0].c);

  } catch (e) {
    console.error("Error:", e.message);
  }

  await sql.end();
}

main().catch(console.error);
