// The token radar's value model, radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token (no market cap, no CoinGecko id, no symbol) and
// pass the snapshot's own launch-candidate rule: not a wrapped, staked or bridged product of a
// protocol whose token already trades, by the field guide's definition (input/README.md). The
// watchlist is the floor: all 40 of its slugs are ranked, and the early radar adds the rankable
// pre-token protocols below it, strongest first. Live-token protocols are never ranked; they are
// set aside in their own panel with the market's own values -- and they calibrate the model.
//
// Implied value follows only from the snapshot's own figures. No protocol name is special-cased
// and no multiple is hand-picked: every category multiple is CALIBRATED from the snapshot itself,
// as the median market-cap-to-TVL ratio of the live-token protocols in that category. A category
// with fewer than three live comparables falls back to the global median across all live
// protocols. The calibration is computed at run time from the sealed snapshot, so it is
// deterministic and the dashboard can show its own basis: which live protocols set each multiple.
//
//   category multiple  median mcap_usd / tvl_usd of live protocols in the category (see
//                      calibrate); clamped to 0.05..1.00, global median when n < 3
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
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_tau_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  breadth_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  min_calibration_n: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_tau_days: 365,
  unknown_age_days: 180,
  breadth_weight: 0.05,
  breadth_cap: 1.25,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  min_calibration_n: 3,
};

/** The model's version label, shown in the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** How many early rows the board carries at most, beyond the watchlist. */
export const EARLY_ROWS = 260;

/** How many live-token protocols the Live panel carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many fastest-growing board rows the Movers strip carries. */
export const MOVERS_ROWS = 5;

/**
 * The category groups, in match order: the first keyword a category contains wins. Order matters
 * where a name contains two keywords ("Cross Chain Bridge" is a bridge, not a chain; "Indexes" is
 * an index, not a DEX). The same order resolves both a row's multiple and the live protocols that
 * calibrate each group, so the calibration and the ranking agree.
 */
export interface CategoryGroup {
  key: string;
  label: string;
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { key: 'bridge', label: 'Bridge' },
  { key: 'index', label: 'Indexes' },
  { key: 'dex', label: 'DEX' },
  { key: 'lend', label: 'Lending' },
  { key: 'cdp', label: 'CDP' },
  { key: 'collateral', label: 'Collateral' },
  { key: 'derivative', label: 'Derivatives' },
  { key: 'perpetual', label: 'Perpetuals' },
  { key: 'options', label: 'Options' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'prediction', label: 'Prediction' },
  { key: 'payment', label: 'Payments' },
  { key: 'yield', label: 'Yield' },
  { key: 'farm', label: 'Farming' },
  { key: 'leveraged', label: 'Leveraged' },
  { key: 'curator', label: 'Risk curators' },
  { key: 'allocator', label: 'Allocators' },
  { key: 'basis', label: 'Basis trading' },
  { key: 'rwa', label: 'RWA' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'staking', label: 'Staking' },
  { key: 'restak', label: 'Restaking' },
  { key: 'stable', label: 'Stablecoin' },
  { key: 'btc', label: 'BTC' },
  { key: 'chain', label: 'Chain' },
];

/** One calibrated group: the multiple the market implies, and how many live protocols set it. */
export interface CalibrationGroup {
  key: string;
  label: string;
  multiple: number;
  n: number;
  calibrated: boolean;
}

/** The whole calibration: every group's multiple, plus the global fallback. */
export interface Calibration {
  groups: CalibrationGroup[];
  global_median: number;
  global_n: number;
}

/** A protocol's category group: the first keyword its category contains, else null. */
export function groupKeyFor(category: string | null): string | null {
  const c = (category ?? '').toLowerCase();
  for (const group of CATEGORY_GROUPS) if (c.includes(group.key)) return group.key;
  return null;
}

/** The median of a non-empty list, deterministic: sorted, middle or mean of the two middles. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A multiple inside the model's floor and cap. */
export function clampMultiple(value: number, model: ModelConstants = MODEL): number {
  return Math.min(model.multiple_cap, Math.max(model.multiple_floor, value));
}

/**
 * Calibrate every category multiple from the snapshot's own live-token protocols: for each group,
 * the median market-cap-to-TVL ratio of the live protocols that resolve to it. A group with fewer
 * than min_calibration_n live comparables takes the global median instead, and says so. Nothing
 * here is hand-picked: the same snapshot in gives the same calibration out, every run.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const globalRatios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = globalRatios.length > 0 ? clampMultiple(median(globalRatios), model) : 0.2;
  const buckets = new Map<string, number[]>();
  for (const p of live) {
    const key = groupKeyFor(p.category);
    if (key === null) continue;
    const ratios = buckets.get(key) ?? [];
    ratios.push(p.mcap_usd! / p.tvl_usd);
    buckets.set(key, ratios);
  }
  const groups: CalibrationGroup[] = CATEGORY_GROUPS.map(({ key, label }) => {
    const ratios = buckets.get(key) ?? [];
    const calibrated = ratios.length >= model.min_calibration_n;
    return {
      key,
      label,
      multiple: calibrated ? clampMultiple(median(ratios), model) : globalMedian,
      n: ratios.length,
      calibrated,
    };
  });
  return { groups, global_median: globalMedian, global_n: globalRatios.length };
}

/** A protocol's TVL multiple from the calibration: its group's multiple, else the global median. */
export function categoryMultiple(category: string | null, calibration: Calibration): number {
  const key = groupKeyFor(category);
  if (key === null) return calibration.global_median;
  const group = calibration.groups.find((g) => g.key === key);
  return group === undefined ? calibration.global_median : group.multiple;
}

/** The calibration basis for one category: which group set it, from how many live protocols. */
export function calibrationBasis(
  category: string | null,
  calibration: Calibration,
): { label: string; multiple: number; n: number; calibrated: boolean } {
  const key = groupKeyFor(category);
  if (key === null) {
    return { label: 'All live protocols', multiple: calibration.global_median, n: calibration.global_n, calibrated: false };
  }
  const group = calibration.groups.find((g) => g.key === key);
  if (group === undefined) {
    return { label: 'All live protocols', multiple: calibration.global_median, n: calibration.global_n, calibrated: false };
  }
  if (!group.calibrated) {
    return { label: group.label, multiple: calibration.global_median, n: group.n, calibrated: false };
  }
  return { label: group.label, multiple: group.multiple, n: group.n, calibrated: true };
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
    calibration_n: number;
    calibration_group: string;
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
  calibration_n: number;
  calibration_group: string;
  calibration_calibrated: boolean;
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
  calibration: Calibration;
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
  calibration: Calibration,
  model: ModelConstants = MODEL,
): {
  implied: number;
  catMult: number;
  basis: { label: string; multiple: number; n: number; calibrated: boolean };
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const basis = calibrationBasis(protocol.category, calibration);
  const catMult = basis.multiple;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days));
  const breadthMult = Math.min(model.breadth_cap, 1 + model.breadth_weight * Math.log(Math.max(1, protocol.chains.length)));
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * breadthMult));
  return { implied, catMult, basis, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A name carrying a whole word wrapped, staked, staking or restaking is a product of another protocol's token. */
const WRAPPED_WORD = /\b(wrapped|restaking|staked|staking)\b/i;
/** A name beginning with an exchange's name is that exchange's product, not a protocol of its own. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;
/**
 * Categories the field guide excludes from the watchlist: a wrapped, staked, bridged or exchange
 * product rather than a launch of its own. The board uses the snapshot's own list, word for word,
 * so a pre-token protocol the house counts as a launch candidate is one here too.
 */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

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
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
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
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, calibration, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => ({ p, v: impliedValue(p, snapshot.as_of, calibration, model) }));
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
      calibration_n: s.v.basis.n,
      calibration_group: s.v.basis.label,
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

/** The category's core action, in words a farmer can follow. */
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
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis strategy vault on ${chain} and leave it staked.`;
  if (c.includes('cedefi')) return `Deposit $${capital} into ${name}'s managed vault on ${chain} and keep the receipt token.`;
  if (c.includes('governance')) return `Lock $${capital} of the protocol's incentive asset on ${chain} and delegate the vote it carries.`;
  if (c.includes('btc')) return `Deposit $${capital} of a BTC-backed asset into ${name} on ${chain} and hold the receipt.`;
  if (c === 'chain') return `Bridge $${capital} to ${name}'s chain and use one native app on it, such as its DEX or lending market.`;
  if (c.includes('payment')) return `Move $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s private pool on ${chain} and hold the note.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index token on ${chain} and hold it.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/** A second, different qualifying action for the same protocol: a farm with two actions counts more than one with one. */
function secondActionFor(p: SnapshotProtocol, capital: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow a small amount against your supply, about a quarter of it, and repay it the same week: borrowing is a second qualifying action.`;
  if (c.includes('dex')) return `Stake the LP tokens in ${name}'s gauge or rewards contract, or vote with them if the pool runs a gauge.`;
  if (c.includes('bridge')) return `Bridge a small amount back the other way, or use a second route the bridge offers, so the activity is not a single transfer.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate the receipt token or restake it through the protocol's own staking flow, if it offers one.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Provide $${capital / 2} of liquidity to ${name}'s vault or liquidity pool as well as trading on margin.`;
  if (c.includes('prediction')) return `Place a second position in a different market, so the activity spans two markets instead of one.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit into a second ${name} vault with a different risk profile, so the activity spans two vaults.`;
  if (c.includes('stable')) return `Use the stable asset you minted in a lending market or a pool, so it moves instead of sitting idle.`;
  if (c.includes('rwa')) return `Stake the yield-bearing asset in the protocol's staking contract, if it offers one, and claim the yield weekly.`;
  if (c.includes('insurance')) return `Stake a small amount in ${name}'s cover pool as well as holding a policy, so you are on both sides of the cover.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged') || c.includes('basis') || c.includes('cedefi')) {
    return `Compound the first rewards back into the same position within the first week, so the position grows and the activity repeats.`;
  }
  if (c.includes('governance')) return `Vote on one live proposal with the locked position, so the lock is an active one.`;
  if (c === 'chain') return `Use a second native app on the chain, such as its lending market if you used the DEX first.`;
  if (c.includes('payment')) return `Set up a second, recurring transfer through ${name}, so the activity repeats without a new decision.`;
  if (c.includes('privacy')) return `Make one private transfer out of the pool to a fresh address, so the pool sees both directions.`;
  if (c.includes('index')) return `Stake the index token if the protocol offers staking, or rebalance into a second index it lists.`;
  return `Make a second, different qualifying action in the same app within the first week, such as a swap, a borrow or a vote.`;
}

/** The weekly cadence, in the category's own verbs. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Add a little supply, or borrow and repay a small amount, once a week.`;
  if (c.includes('dex')) return `Make one swap or adjust the liquidity range once a week.`;
  if (c.includes('bridge')) return `Bridge a small amount once a week, alternating direction when the route allows it.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim the staking rewards and restake them once a week.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Open and close one small position once a week, keeping the size flat.`;
  if (c.includes('prediction')) return `Place one small position in a new market once a week.`;
  if (c.includes('curator') || c.includes('allocator')) return `Top up one vault by a small amount once a week, or move a little between vaults.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged') || c.includes('basis') || c.includes('cedefi')) {
    return `Claim and compound the yield once a week.`;
  }
  if (c.includes('governance')) return `Vote on any live proposal once a week, and check for new ones.`;
  if (c.includes('payment')) return `Send one transfer a week through the protocol.`;
  return `Do one qualifying action every week, a deposit, a borrow, a swap or a vote.`;
}

/** What to watch while holding: the protocol's age and growth set the note. */
function watchNoteFor(age: number | null, growth: number | null): string {
  const parts: string[] = [];
  if (age !== null && age < 180) parts.push('young protocols often run their first points season in the first months, and early activity is usually weighted most');
  else if (age !== null && age >= 365) parts.push('mature protocols snapshot less often, but a full month of activity still counts');
  else parts.push('activity is usually counted across several snapshots, so a gap of one week is not fatal');
  if (growth !== null && growth > 20) parts.push('TVL is growing fast, so activity now is likely to be counted before the crowd arrives');
  else if (growth !== null && growth < -20) parts.push('TVL is falling, so keep the position small and confirm the protocol is still active before adding more');
  return parts.join('; ') + '.';
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
 * from the protocol's own record (category, chains, TVL, age, growth), never from a hand-written
 * list: the core action, the second action, the weekly cadence and the watch note all change with
 * the protocol, so two rows' plans read differently.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const gas = dollars(gasFor(p));
  const gasSecond = second !== null ? dollars(gasForChain(second)) : gas;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const watch = watchNoteFor(age, p.change_7d);
  const watchCapped = watch.charAt(0).toUpperCase() + watch.slice(1);
  const steps: FarmStep[] = [
    {
      text:
        second !== null
          ? `Open a fresh wallet that holds only your farm funds, keep its seed phrase offline, and fund it with $${capital} plus about ${gas} for gas on ${chain} and ${gasSecond} for ${second}.`
          : `Open a fresh wallet that holds only your farm funds, keep its seed phrase offline, and fund it with $${capital} plus about ${gas} for gas on ${chain}.`,
      cost: `about ${gas} of gas to arrive funded`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital),
      cost: `about ${gas} of gas`,
      time: '10 minutes',
    },
    {
      text: `${weeklyActionFor(p)} Spreading the activity over several snapshots is what counts.`,
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days before you unwind anything. ${watchCapped}`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `After a week, open the protocol's own points or rewards page and confirm your activity is counted; claim only from the link it publishes, and never pay a fee to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log. Unwind only after a token launches and the airdrop is claimed; if the protocol runs a second season, keep a small position staked for it.`,
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
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData; calibration: Calibration } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
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
    calibration,
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
      calibration_n: r.model.calibration_n,
      calibration_group: r.model.calibration_group,
      calibration_calibrated: calibrationBasis(r.category, calibration).calibrated,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      breadth_multiplier: r.model.breadth_multiplier,
      farm_steps: r.farm_steps,
    })),
    live,
    movers,
  };
  return { board, radar, calibration };
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
