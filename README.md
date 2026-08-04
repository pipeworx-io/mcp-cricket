# mcp-cricket

Cricket MCP — wraps CricAPI (api.cricapi.com) for live cricket data.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `current_matches` | List current and recent cricket matches (Test/ODI/T20) with live scores, teams, venue, and status. Use this for "what cricket matches are live/on right now". Returns match IDs usable with match_info. |
| `match_scores` | Get a lightweight feed of live cricket scores across current matches. Returns each match as a compact "team1 vs team2" with running scores and status. Best for quick live cricket score checks. |
| `search_players` | Search for cricket players by name. Returns player IDs, names, and country. Use this to look up a cricketer before fetching more detail. |
| `match_info` | Get full information and scorecard for a single cricket match (Test/ODI/T20) by its match ID. Returns teams, venue, innings scores, toss, and winner. Get the id from current_matches. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "cricket": {
      "url": "https://gateway.pipeworx.io/cricket/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Cricket data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
