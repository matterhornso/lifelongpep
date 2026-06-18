# lifelongpep MCP server

MCP wrapper for lifelongpep's lead API. It lets agents submit pre-launch intake and GLP-1 consult request interest through structured tools.

## Tools

- `lifelongpep_get_capabilities`
- `lifelongpep_submit_agent_intake`
- `lifelongpep_submit_glp1_consult_request`
- `lifelongpep_get_request_status`

## Environment

```bash
export LIFELONGPEP_API_BASE="https://api.lifelongpep.fit"
```

The public tools do not need the admin token. Admin operations should stay in the dashboard and API, not in the public MCP server.

## Run locally

```bash
npm install
npm start
```

Example MCP client config:

```json
{
  "mcpServers": {
    "lifelongpep": {
      "command": "node",
      "args": ["/absolute/path/to/lifelongpep-www/backend/mcp-server/src/index.js"],
      "env": {
        "LIFELONGPEP_API_BASE": "https://api.lifelongpep.fit"
      }
    }
  }
}
```

## Guardrail

This MCP server captures pre-launch interest only. It does not provide medical advice, diagnosis, prescription, payment, fulfillment, or live booking.
