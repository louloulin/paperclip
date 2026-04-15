#!/usr/bin/env python3
"""
Verify Python SDK against real Paperclip server (port 3101)
Tests all major resource endpoints.
"""

import sys

BASE_URL = "http://127.0.0.1:3101"

try:
    from paperclip import PaperclipClient
    from paperclip.errors import PaperclipError
except ImportError as e:
    print(f"ERROR: Could not import paperclip SDK: {e}")
    print("Install with: pip install -e packages/sdk-python")
    sys.exit(1)

passed = 0
failed = 0


def test(name: str, fn):
    global passed, failed
    try:
        result = fn()
        print(f"  ✓ {name}")
        passed += 1
        return result
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        failed += 1
        return None


print("=" * 60)
print("Paperclip Python SDK Verification")
print("=" * 60)

client = PaperclipClient(base_url=BASE_URL)

# 1. Health check
print("\n1. Health Check")
test("health.check()", lambda: client.health.check())

# 2. Companies
print("\n2. Companies")
companies = test("companies.list()", lambda: client.companies.list())
company_id = companies[0]["id"] if companies and len(companies) > 0 else None
if companies and len(companies) > 0:
    test("companies.get(id)", lambda: client.companies.get(company_id))
else:
    print("  - No companies found, skipping company-specific tests")

if company_id:
    # 3. Agents
    print("\n3. Agents")
    agents = test("agents.list(company_id)", lambda: client.agents.list(company_id))
    if agents and len(agents) > 0:
        agent_id = agents[0]["id"]
        test("agents.get(company_id, agent_id)", lambda: client.agents.get(company_id, agent_id))
        test("agents.inbox(company_id, agent_id)", lambda: client.agents.inbox(company_id, agent_id))
        test("agents.budget_precheck(company_id, agent_id)", lambda: client.agents.budget_precheck(company_id, agent_id))
    else:
        agent_id = None

    # 4. Issues
    print("\n4. Issues")
    test("issues.list(company_id)", lambda: client.issues.list(company_id))

    # 5. Projects
    print("\n5. Projects")
    test("projects.list(company_id)", lambda: client.projects.list(company_id))

    # 6. Goals
    print("\n6. Goals")
    test("goals.list(company_id)", lambda: client.goals.list(company_id))

    # 7. Approvals
    print("\n7. Approvals")
    test("approvals.list(company_id)", lambda: client.approvals.list(company_id))

    # 8. Costs
    print("\n8. Costs")
    test("costs.list(company_id)", lambda: client.costs.list(company_id))

    # 9. Dashboard
    print("\n9. Dashboard")
    test("dashboard.stats(company_id)", lambda: client.dashboard.stats(company_id))

    # 10. Activity
    print("\n10. Activity")
    test("activity.list(company_id)", lambda: client.activity.list(company_id))

    # 11. Collaboration
    print("\n11. Collaboration")
    test("collaboration.sessions(company_id)", lambda: client.collaboration.sessions(company_id))
    test("collaboration.stats(company_id)", lambda: client.collaboration.stats(company_id))

    # 12. Departments
    print("\n12. Departments")
    depts = test("departments.list(company_id)", lambda: client.departments.list(company_id))

    # 13. Waves
    print("\n13. Waves")
    test("waves.list(company_id)", lambda: client.waves.list(company_id))

    # 14. Compliance
    print("\n14. Compliance")
    test("compliance.list(company_id)", lambda: client.compliance.list(company_id))

# 15. Skills (SkillMart)
print("\n15. Skills (SkillMart)")
skills = test("skills.list()", lambda: client.skills.list())
test("skills.tags()", lambda: client.skills.tags())

# 16. Webhooks (requires company_id)
if company_id:
    print("\n16. Webhooks")
    test("webhooks.list(company_id)", lambda: client.webhooks.list(company_id))
    test("webhooks.stats(company_id)", lambda: client.webhooks.stats(company_id))

# 17. Templates
print("\n17. Templates")
test("templates.list()", lambda: client.templates.list())
test("templates.categories()", lambda: client.templates.categories())

# 18. SSO Providers
print("\n18. SSO")
test("sso.providers()", lambda: client.sso.providers())
if company_id:
    test("sso.list(company_id)", lambda: client.sso.list(company_id))

# 19. Payments
print("\n19. Payments")
test("payments.purchases()", lambda: client.payments.purchases())

# 20. Demo Leads
print("\n20. Demo Leads")
test("demo_leads.list()", lambda: client.demo_leads.list())
test("demo_leads.pipeline()", lambda: client.demo_leads.pipeline())

# Summary
print("\n" + "=" * 60)
print(f"Results: {passed} passed, {failed} failed")
print("=" * 60)
sys.exit(0 if failed == 0 else 1)
