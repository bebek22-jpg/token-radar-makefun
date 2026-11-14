// The token radar's value model: one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token (no market cap, no CoinGecko id, no symbol) and
// are not a wrapped, staked or bridged product of a protocol whose token already trades -- the same
// definition the snapshot's watchlist uses, minus its $50M floor. The watchlist is the floor: all
// 40 of its slugs are ranked, and the early radar adds the rankable pre-token protocols below it,
// scored by the model, strongest first. Live-token protocols are never ranked; they are set aside
// in their own panel with the market's own values.
//
// Implied value follows only from the snapshot's own figures. No protocol name is special-cased:
// the same function scores every row, and every constant is stated in the dashboard.
//
//   category multiple  a TVL multiple by the protocol's DefiLlama category (see CATEGORY_RULES)
//   momentum           1 + clamp(change_7d, -50, 150) / 100 x 0.6
//   maturity           0.55 + 0.45 x (1 - e^(-age_days / 365)): a protocol that ran long with no
//                      token is worth more of its TVL; the curve saturates, so age stops paying
//                      after a few years. Unknown age counts as 180 days.
//   breadth            min(1.25, 1 + 0.05 x ln(chains)): TVL spread over more chains is worth
//                      more than TVL on one chain.
//   implied            max(1, round(tvl_usd x category x momentum x maturity x breadth))

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  default_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  default_multiple: 0.25,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_tau_days: 365,
  unknown_age_days: 180,
  breadth_weight: 0.05,
  breadth_cap: 1.25,
};

/** The model's version label, shown in the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** How many early rows the board carries at most, beyond the watchlist. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the Live panel carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many fastest-growing board rows the Movers strip carries. */
export const MOVERS_ROWS = 5;

/**
 * The category multiples, in match order: the first keyword a category contains wins. Order
 * matters where a name contains two keywords ("Cross Chain Bridge" is a bridge, not a chain;
 * "Indexes" is an index, not a DEX).
 */
export interface CategoryRule {
  key: string;
  label: string;
  multiple: number;
}

export const CATEGORY_RULES: CategoryRule[] = [
  { key: 'bridge', label: 'Bridge', multiple: 0.12 },
  { key: 'index', label: 'Indexes', multiple: 0.22 },
  { key: 'dex', label: 'DEX', multiple: 0.32 },
  { key: 'lend', label: 'Lending', multiple: 0.3 },
  { key: 'cdp', label: 'CDP', multiple: 0.3 },
  { key: 'collateral', label: 'Collateral', multiple: 0.3 },
  { key: 'derivative', label: 'Derivatives', multiple: 0.28 },
  { key: 'perpetual', label: 'Perpetuals', multiple: 0.28 },
  { key: 'options', label: 'Options', multiple: 0.28 },
  { key: 'privacy', label: 'Privacy', multiple: 0.28 },
  { key: 'prediction', label: 'Prediction', multiple: 0.26 },
  { key: 'payment', label: 'Payments', multiple: 0.26 },
  { key: 'yield', label: 'Yield', multiple: 0.24 },
  { key: 'farm', label: 'Farming', multiple: 0.24 },
  { key: 'leveraged', label: 'Leveraged', multiple: 0.24 },
  { key: 'curator', label: 'Risk curators', multiple: 0.24 },
  { key: 'allocator', label: 'Allocators', multiple: 0.24 },
  { key: 'basis', label: 'Basis trading', multiple: 0.24 },
  { key: 'rwa', label: 'RWA', multiple: 0.22 },
  { key: 'insurance', label: 'Insurance', multiple: 0.22 },
  { key: 'staking', label: 'Staking', multiple: 0.16 },
  { key: 'restak', label: 'Restaking', multiple: 0.16 },
  { key: 'stable', label: 'Stablecoin', multiple: 0.18 },
  { key: 'btc', label: 'BTC', multiple: 0.2 },
  { key: 'chain', label: 'Chain', multiple: 0.35 },
];

/** A protocol's TVL multiple from its category: the first matching rule, else the default. */
export function categoryMultiple(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  for (const rule of CATEGORY_RULES) if (c.includes(rule.key)) return rule.multiple;
  return MODEL.default_multiple;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row's compact form for data.js, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_rules: CategoryRule[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
  movers: string[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Every multiplier and the implied value one protocol gets. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; catMult: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const catMult = categoryMultiple(protocol.category);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days));
  const breadthMult = Math.min(model.breadth_cap, 1 + model.breadth_weight * Math.log(Math.max(1, protocol.chains.length)));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * breadthMult));
  return { implied, catMult, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word wrapped, staked, staking or restaking is a product of another protocol's token. */
const WRAPPED_WORD = /\b(wrapped|restaking|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product, not a protocol of its own. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
/** Categories that are a wrapped, staked, bridged or exchange product rather than a launch of their own. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'Restaking', 'Stablecoin Wrapper', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped, staked, bridged or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The protocols the board ranks, strongest first, with ranks 1..N. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names is ranked.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the floor, by the model's own score.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watchlist = new Set(snapshot.watchlist);
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.catMult,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age),
  }));
}

// ---------------------------------------------------------------- farm plans

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** Typical gas for one simple transaction on a chain, in dollars. */
const GAS_USD: Record<string, number> = {
  ethereum: 4.5,
  base: 0.1,
  arbitrum: 0.15,
  optimism: 0.1,
  bsc: 0.15,
  'bnb chain': 0.15,
  polygon: 0.05,
  solana: 0.02,
  avalanche: 0.25,
  sui: 0.05,
  aptos: 0.05,
  zksync: 0.15,
  linea: 0.1,
  scroll: 0.1,
  blast: 0.1,
  mode: 0.05,
  gnosis: 0.05,
  fantom: 0.05,
  celo: 0.02,
  near: 0.02,
  cosmos: 0.05,
  tron: 0.5,
  bitcoin: 2.0,
  mantle: 0.05,
  berachain: 0.05,
  hyperliquid: 0.05,
  sei: 0.02,
  injective: 0.02,
  starknet: 0.2,
};

/** Gas for one transaction on a named chain, in dollars. */
function gasForChain(chain: string): number {
  return GAS_USD[chain.toLowerCase()] ?? 0.5;
}

/** Gas for one transaction on the protocol's first chain, in dollars. */
function gasFor(p: SnapshotProtocol): number {
  return p.chains.length > 0 ? gasForChain(p.chains[0]!) : 0.5;
}

/** A dollar figure as "$0.10" or "$4.50". */
function dollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and leave the position open.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and leave the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Deposit $${capital} into ${name}'s main yield position on ${chain} and leave it staked.`;
  if (c === 'chain') return `Bridge $${capital} to ${name}'s chain and use one native app on it, such as its DEX or lending market.`;
  if (c.includes('payment')) return `Move $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s private pool on ${chain} and hold the note.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const gas = dollars(gasFor(p));
  const gasSecond = second !== null ? dollars(gasForChain(second)) : gas;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const steps: FarmStep[] = [
    {
      text: `Open a fresh wallet that holds only your farm funds, keep its seed phrase offline, and fund it with $${capital} plus about ${gas} for gas on ${chain}.`,
      cost: `about ${gas} of gas to arrive funded`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text:
        second !== null
          ? `Repeat the same position on ${second} so your activity is counted on two chains instead of one.`
          : `Make a second, different qualifying action in the same app within the first week, such as a swap, a borrow or a vote.`,
      cost: `about ${gasSecond} of gas`,
      time: '10 minutes',
    },
    {
      text: `Do one qualifying action every week, a deposit, a borrow, a swap or a vote, so your activity spans several snapshots.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days before you unwind anything, so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `After a week, open the protocol's own points or rewards page and confirm your activity is counted; claim only from the link it publishes, and never pay a fee to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return steps.map(stepText);
}

// ---------------------------------------------------------------- the radar

/** The live-token protocols, by market cap, for the dashboard's Live panel. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const movers = board
    .filter((r) => r.change_7d !== null)
    .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, MOVERS_ROWS)
    .map((r) => r.slug);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    category_rules: CATEGORY_RULES,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      watchlist: r.watchlist,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      farm_steps: r.farm_steps,
    })),
    live,
    movers,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
