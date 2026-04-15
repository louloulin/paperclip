// Quick SDK verification test — runs against live Paperclip server
import { PaperclipClient, PaperclipError } from "./dist/index.mjs";

const client = new PaperclipClient({
  baseUrl: "http://127.0.0.1:3103",
});

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log("=== Paperclip SDK Verification ===\n");

// Health check
await test("health.check() → status ok", async () => {
  const health = await client.health.check();
  if (health.status !== "ok") throw new Error(`Expected ok, got ${health.status}`);
  if (!health.version) throw new Error("Missing version");
});

// Companies
let companyId;
await test("companies.list() → returns array", async () => {
  const companies = await client.companies.list();
  if (!Array.isArray(companies)) throw new Error("Expected array");
  if (companies.length > 0) companyId = companies[0].id;
});

if (companyId) {
  await test("companies.get(id) → returns company", async () => {
    const company = await client.companies.get(companyId);
    if (!company.id) throw new Error("Missing id");
    if (!company.name) throw new Error("Missing name");
  });

  // Agents
  await test("agents.list(companyId) → returns array", async () => {
    const agents = await client.agents.list(companyId);
    if (!Array.isArray(agents)) throw new Error("Expected array");
  });

  // Issues
  await test("issues.list(companyId) → returns array", async () => {
    const issues = await client.issues.list(companyId);
    if (!Array.isArray(issues)) throw new Error("Expected array");
  });

  // Dashboard
  await test("dashboard.stats(companyId) → returns stats", async () => {
    const stats = await client.dashboard.stats(companyId);
    if (!stats.agents) throw new Error("Missing agents stats");
  });

  // Activity
  await test("activity.list(companyId) → returns array", async () => {
    const activity = await client.activity.list(companyId);
    if (!Array.isArray(activity)) throw new Error("Expected array");
  });

  // Skills
  await test("skills.list() → returns array", async () => {
    const skills = await client.skills.list();
    if (!Array.isArray(skills)) throw new Error("Expected array");
  });

  // Templates
  await test("templates.list() → returns array", async () => {
    const templates = await client.templates.list();
    if (!Array.isArray(templates)) throw new Error("Expected array");
  });

  // Departments
  await test("departments.list(companyId) → returns array", async () => {
    const depts = await client.departments.list(companyId);
    if (!Array.isArray(depts)) throw new Error("Expected array");
  });

  // Webhook stats
  await test("webhooks.stats(companyId) → returns stats", async () => {
    const stats = await client.webhooks.stats(companyId);
    if (!stats) throw new Error("Expected stats object");
  });

  // Collaboration stats
  await test("collaboration.stats(companyId) → returns stats", async () => {
    const stats = await client.collaboration.stats(companyId);
    if (!stats) throw new Error("Expected stats object");
  });
}

// Error handling — PaperclipError on bad request
await test("PaperclipError on invalid request", async () => {
  try {
    await client.companies.get("nonexistent-id-12345");
    throw new Error("Should have thrown");
  } catch (e) {
    if (!(e instanceof PaperclipError)) throw new Error("Expected PaperclipError, got " + e.constructor.name);
    // Server may return 500 for invalid UUID, just verify error type
  }
});

// Create + Delete test (round-trip)
let testIssueId;
if (companyId) {
  await test("issues.create() + issues.update() → round-trip", async () => {
    const issue = await client.issues.create(companyId, {
      title: "SDK Test Issue",
      priority: "medium",
    });
    if (!issue.id) throw new Error("Missing issue id");
    if (issue.title !== "SDK Test Issue") throw new Error(`Title mismatch: ${issue.title}`);
    testIssueId = issue.id;

    const updated = await client.issues.update(testIssueId, { status: "done" });
    if (updated.status !== "done") throw new Error(`Status mismatch: ${updated.status}`);
  });

  // Add comment
  if (testIssueId) {
    await test("issues.addComment() → success", async () => {
      const result = await client.issues.addComment(testIssueId, "SDK test comment");
      if (!result) throw new Error("Expected comment result");
    });
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
