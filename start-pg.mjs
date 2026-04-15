import { resolveMigrationConnection } from "/Users/louloulin/Documents/linchong/opc/paperclip/packages/db/dist/migration-runtime.js";

async function main() {
  console.log("Starting embedded PostgreSQL...");
  try {
    const resolved = await resolveMigrationConnection();
    console.log("Embedded PostgreSQL started!");
    console.log("Connection string:", resolved.connectionString);
    console.log("Source:", resolved.source);

    // Keep running
    console.log("Waiting 120 seconds...");
    await new Promise(r => setTimeout(r, 120000));
    console.log("Done");
    await resolved.stop();
  } catch (e) {
    console.error("Error:", e.message);
  }
}

main().catch(console.error);
