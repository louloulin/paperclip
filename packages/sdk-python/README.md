# Paperclip Python SDK

Official Python SDK for the Paperclip AI Company Control Plane API.

## Installation

```bash
pip install paperclip-sdk
```

For async support:

```bash
pip install paperclip-sdk[async]
```

## Quick Start

```python
from paperclip import PaperclipClient

client = PaperclipClient(
    base_url="http://localhost:3101",
    api_key="pc_abc123"
)

# List companies
companies = client.companies.list()
print(companies)

# Create an issue
issue = client.issues.create(company_id, {
    "title": "Build feature X",
    "priority": "high"
})
```

## Async Usage

```python
import asyncio
from paperclip.async_client import AsyncPaperclipClient

async def main():
    client = AsyncPaperclipClient(
        base_url="http://localhost:3101",
        api_key="pc_abc123"
    )
    companies = await client.companies.list()
    print(companies)

asyncio.run(main())
```

## Features

- **20+ API resources**: companies, agents, issues, projects, goals, approvals, costs, skills, webhooks, templates, collaboration, SSO, departments, waves, activity, compliance, payments, health, dashboard, demo_leads
- **Zero runtime dependencies** (sync) or minimal (async with httpx)
- **Full type hints** with dataclasses
- **Pythonic API**: snake_case methods, Python dict/list responses

## License

MIT
