# Docker Engine 29.4.0 suppresses internal bridge port publication

Date: 2026-11-28
Source: agent

## Need
Reach synthetic PostgREST from the host while keeping the fixture on an internal bridge.
## Tried
Docker Engine 29.4.0 suppressed port publication on the required internal bridge.
## Decision
Forward REST through the loopback gateway with `docker exec` and `curl` rather than attaching an egress-capable network.
## Revisit when
Docker Engine supports port publication on the internal bridge.
