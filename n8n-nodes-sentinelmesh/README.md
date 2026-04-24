# n8n-nodes-sentinelmesh

`SentinelMesh Security Gate` is an n8n community node that evaluates workflow actions through SentinelMesh before your automation continues.

## Features

- Native n8n credentials support (`SentinelMesh API`)
- Bearer token auth with masked token handling in error context
- ALLOW/BLOCK decision gating for workflow execution
- Optional `Fail on Block` mode
- Optional `Enable Debug Logs` to include raw API response

## Node

- **Display Name:** SentinelMesh Security Gate
- **Node Name:** SentinelMesh
- **Credential Type:** SentinelMesh API

## Credential Setup

Create a credential in n8n:

- **Base URL:** `http://localhost:8002`
- **Integration Token:** `sm_int_...`

The node calls `POST {Base URL}/api/v1/events`.

## Node Parameters

- `Integration ID` (required)
- `Action Name` (required)
- `Payload (JSON)` (required)
- `Fail on Block` (default: `true`)
- `Enable Debug Logs` (default: `false`)

## Request Sent to SentinelMesh

```json
{
  "integration_id": "your-integration-id",
  "action": "workflow_action_name",
  "metadata": {
    "data": "={{ $json }}"
  }
}
```

## Decision Behavior

- `ALLOW` -> returns success output with message: `Allowed by SentinelMesh (Risk: X)`
- `BLOCK` + `Fail on Block = true` -> throws error: `Blocked by SentinelMesh (Risk: X)`
- `BLOCK` + `Fail on Block = false` -> returns decision object, workflow can branch manually

## Output

```json
{
  "decision": "ALLOW",
  "risk_score": 42,
  "reason": "Safe action",
  "message": "Allowed by SentinelMesh (Risk: 42)",
  "status_code": 200,
  "integration_id": "abc123",
  "action": "send_email"
}
```

When `Enable Debug Logs` is true, output also includes:

```json
{
  "raw_response": {}
}
```

## Security Model

- No browser/user cookies are sent by the node.
- Integration token is stored in n8n credentials and never included in node output.
- Token is masked (`Bearer ***`) in generated error request context.
- SentinelMesh validates integration ownership and can rate limit execution server-side.
- Malicious or risky automations can be blocked before downstream steps execute.

## Install

```bash
cd n8n-nodes-sentinelmesh
npm install
npm run build
```

## Local Link to n8n

```bash
cd n8n-nodes-sentinelmesh
npm link

# link into your n8n custom extensions location
cd ~/.n8n/custom
npm link n8n-nodes-sentinelmesh

n8n start --tunnel
```

## Example Workflow JSON (minimal)

```json
{
  "name": "SentinelMesh Gate Example",
  "nodes": [
    {
      "parameters": {},
      "id": "manual-trigger",
      "name": "Manual Trigger",
      "type": "n8n-nodes-base.manualTrigger",
      "typeVersion": 1,
      "position": [240, 300]
    },
    {
      "parameters": {
        "integrationId": "sm_intg_123",
        "actionName": "send_invoice_email",
        "payload": "{ \"data\": \"={{ $json }}\" }",
        "failOnBlock": true,
        "debugMode": false
      },
      "id": "sentinelmesh-gate",
      "name": "SentinelMesh Security Gate",
      "type": "n8n-nodes-sentinelmesh.sentinelMesh",
      "typeVersion": 1,
      "position": [520, 300],
      "credentials": {
        "sentinelMeshApi": {
          "name": "SentinelMesh API"
        }
      }
    }
  ],
  "connections": {
    "Manual Trigger": {
      "main": [
        [
          {
            "node": "SentinelMesh Security Gate",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## Screenshots

Add screenshots in docs for publish-ready listing:

- `docs/screenshot-node-config.png`
- `docs/screenshot-allowed-output.png`
- `docs/screenshot-blocked-error.png`
