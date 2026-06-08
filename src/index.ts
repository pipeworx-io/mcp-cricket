interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Cricket MCP — wraps CricAPI (api.cricapi.com) for live cricket data.
 *
 * Tools:
 * - current_matches: live + recent cricket matches with scores (Test/ODI/T20)
 * - match_scores: lightweight live cricket scores feed
 * - search_players: find cricket players by name
 * - match_info: full info + scorecard for a single match
 *
 * Dual key model: pass your own CricAPI key via _apiKey for higher limits,
 * or omit it to use the shared Pipeworx platform key (auth resolved upstream).
 * The key is sent as the `apikey` query param.
 */


const BASE_URL = 'https://api.cricapi.com/v1';

const API_KEY_DESC =
  'Optional — your own CricAPI key for higher limits; omit to use the shared Pipeworx key.';

const tools: McpToolExport['tools'] = [
  {
    name: 'current_matches',
    description:
      'List current and recent cricket matches (Test/ODI/T20) with live scores, teams, venue, and status. Use this for "what cricket matches are live/on right now". Returns match IDs usable with match_info.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        offset: {
          type: 'number',
          description: 'Pagination offset (default 0). Each page returns up to 25 matches.',
        },
        _apiKey: { type: 'string', description: API_KEY_DESC },
      },
    },
  },
  {
    name: 'match_scores',
    description:
      'Get a lightweight feed of live cricket scores across current matches. Returns each match as a compact "team1 vs team2" with running scores and status. Best for quick live cricket score checks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: API_KEY_DESC },
      },
    },
  },
  {
    name: 'search_players',
    description:
      'Search for cricket players by name. Returns player IDs, names, and country. Use this to look up a cricketer before fetching more detail.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        search: {
          type: 'string',
          description: 'Player name to search for, e.g. "Kohli", "Root".',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default 0).',
        },
        _apiKey: { type: 'string', description: API_KEY_DESC },
      },
      required: ['search'],
    },
  },
  {
    name: 'match_info',
    description:
      'Get full information and scorecard for a single cricket match (Test/ODI/T20) by its match ID. Returns teams, venue, innings scores, toss, and winner. Get the id from current_matches.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Match ID, as returned by current_matches.',
        },
        _apiKey: { type: 'string', description: API_KEY_DESC },
      },
      required: ['id'],
    },
  },
];

interface CricApiEnvelope {
  apikey?: string;
  data?: unknown;
  status?: string;
  reason?: string;
  info?: unknown;
}

// CricAPI sends key as the `apikey` query param. On success the envelope is
// { apikey, data, status: 'success', info }. On a logical failure it returns
// HTTP 200 with { status: 'failure', reason }. Non-2xx is a transport/auth
// error and we surface the raw body text.
async function cricGet(
  path: string,
  apiKey: string,
  params: Record<string, string>,
): Promise<{ data?: unknown } | { error: string; message: string }> {
  if (!apiKey) {
    return { error: 'api_key_required', message: 'No CricAPI key available.' };
  }

  const qs = new URLSearchParams({ apikey: apiKey, ...params });
  const res = await fetch(`${BASE_URL}${path}?${qs}`);

  if (!res.ok) {
    const text = await res.text();
    return { error: String(res.status), message: text };
  }

  const body = (await res.json()) as CricApiEnvelope;
  if (body.status === 'failure') {
    return { error: 'cricapi_error', message: body.reason ?? 'CricAPI request failed.' };
  }

  return { data: body.data };
}

function isErr(r: unknown): r is { error: string; message: string } {
  return typeof r === 'object' && r !== null && 'error' in r;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'current_matches':
      return currentMatches(args.offset as number | undefined, apiKey);
    case 'match_scores':
      return matchScores(apiKey);
    case 'search_players':
      return searchPlayers(args.search as string, args.offset as number | undefined, apiKey);
    case 'match_info':
      return matchInfo(args.id as string, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function currentMatches(offset: number | undefined, apiKey: string) {
  const res = await cricGet('/currentMatches', apiKey, { offset: String(offset ?? 0) });
  if (isErr(res)) return res;

  const data = (res.data as Array<Record<string, any>>) || [];
  return {
    matches: data.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      match_type: m.matchType,
      venue: m.venue,
      date: m.date,
      teams: m.teams,
      started: m.matchStarted,
      ended: m.matchEnded,
      score: (m.score || []).map((s: Record<string, any>) => ({
        team: s.inning,
        runs: s.r,
        wickets: s.w,
        overs: s.o,
      })),
    })),
  };
}

async function matchScores(apiKey: string) {
  const res = await cricGet('/cricScore', apiKey, {});
  if (isErr(res)) return res;

  const data = (res.data as Array<Record<string, any>>) || [];
  return {
    matches: data.map((m) => ({
      id: m.id,
      series: m.series,
      match: m.t1 + ' vs ' + m.t2,
      status: m.status,
      t1: m.t1,
      t1_score: m.t1s,
      t2: m.t2,
      t2_score: m.t2s,
      match_type: m.matchType,
      date: m.dateTimeGMT,
    })),
  };
}

async function searchPlayers(search: string, offset: number | undefined, apiKey: string) {
  const res = await cricGet('/players', apiKey, {
    search: search ?? '',
    offset: String(offset ?? 0),
  });
  if (isErr(res)) return res;

  const data = (res.data as Array<Record<string, any>>) || [];
  return {
    players: data.map((p) => ({
      id: p.id,
      name: p.name,
      country: p.country,
    })),
  };
}

async function matchInfo(id: string, apiKey: string) {
  const res = await cricGet('/match_info', apiKey, { id: id ?? '' });
  if (isErr(res)) return res;

  const data = (res.data as Record<string, any>) || {};
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    venue: data.venue,
    date: data.date,
    teams: data.teams,
    score: (data.score || []).map((s: Record<string, any>) => ({
      inning: s.inning,
      runs: s.r,
      wickets: s.w,
      overs: s.o,
    })),
    tossWinner: data.tossWinner,
    tossChoice: data.tossChoice,
    matchWinner: data.matchWinner,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
