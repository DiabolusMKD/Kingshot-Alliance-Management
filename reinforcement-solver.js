/**
 * Reinforcement assignment solver
 * ---------------------------------
 * Each player sends `numberOfMarches` marches, one each to a distinct
 * other player (never themselves, never twice to the same target).
 *
 * Effective troops per march (E):
 *   - if troopsPerMarch * numberOfMarches > totalTroops
 *       -> E = totalTroops / numberOfMarches   (can't sustain full strength every march)
 *   - else
 *       -> E = troopsPerMarch
 *
 * Assignment strategy: greedy, round-based.
 *   - Senders are processed largest-E-first each round (so big contributions
 *     get placed while loads are still low, which helps balance things out).
 *   - In each round, every sender with marches left sends one march to the
 *     eligible target (not self, not already sent-to) with the current
 *     lowest total received load.
 *   - Repeated for `max(numberOfMarches)` rounds until everyone's marches
 *     are assigned.
 *
 * This won't always be mathematically optimal (true optimal balancing is
 * an integer program), but it produces a tightly-clustered, near-even
 * distribution in practice, which is what we want here.
 */

const players = [
  { playerName: "Diabolus", numberOfMarches: 6, totalTroops: 844457, troopsPerMarch: 172400 },
  { playerName: "Rhi", numberOfMarches: 6, totalTroops: 1285000, troopsPerMarch: 155000 },
  { playerName: "008", numberOfMarches: 5, totalTroops: 1209000, troopsPerMarch: 166000 },
  { playerName: "Nyke", numberOfMarches: 6, totalTroops: 800000, troopsPerMarch: 154000 },
  { playerName: "Hilde", numberOfMarches: 5, totalTroops: 742000, troopsPerMarch: 153000 },
  { playerName: "Mami Sabrosa", numberOfMarches: 6, totalTroops: 1200000, troopsPerMarch: 164710 },
  { playerName: "Choo", numberOfMarches: 6, totalTroops: 1023500, troopsPerMarch: 147710 },
  { playerName: "Samcie70", numberOfMarches: 6, totalTroops: 1300000, troopsPerMarch: 152000 },
  { playerName: "Logan84 X", numberOfMarches: 6, totalTroops: 1120000, troopsPerMarch: 153710 },
  { playerName: "LadyV12", numberOfMarches: 5, totalTroops: 780000, troopsPerMarch: 138210 },
  { playerName: "Sonhador", numberOfMarches: 6, totalTroops: 960000, troopsPerMarch: 165000 },
  { playerName: "Chel", numberOfMarches: 6, totalTroops: 730000, troopsPerMarch: 149000 },
  { playerName: "Sugarmomma", numberOfMarches: 5, totalTroops: 422909, troopsPerMarch: 141410 },
  { playerName: "Fairview", numberOfMarches: 6, totalTroops: 1000000, troopsPerMarch: 158700 },
  { playerName: "Moce", numberOfMarches: 6, totalTroops: 700000, troopsPerMarch: 134800 },
  { playerName: "/Leon", numberOfMarches: 6, totalTroops: 770000, troopsPerMarch: 162500 },
  { playerName: "DutchKingdom80", numberOfMarches: 6, totalTroops: 1100000, troopsPerMarch: 167000 },
  { playerName: "V!KINGS", numberOfMarches: 6, totalTroops: 700000, troopsPerMarch: 150000 },
  { playerName: "xGolden", numberOfMarches: 6, totalTroops: 1000000, troopsPerMarch: 141000 },
];

function solve(players) {
  // 1. compute effective troops-per-march for each player
  const E = {};
  const N = {};
  for (const p of players) {
    E[p.playerName] =
      p.troopsPerMarch * p.numberOfMarches > p.totalTroops
        ? p.totalTroops / p.numberOfMarches
        : p.troopsPerMarch;
    N[p.playerName] = p.numberOfMarches;
  }

  const names = players.map((p) => p.playerName);

  // 2. init tracking structures
  const remaining = { ...N };
  const sentTo = Object.fromEntries(names.map((n) => [n, new Set()]));
  const load = Object.fromEntries(names.map((n) => [n, 0]));
  const incoming = Object.fromEntries(names.map((n) => [n, []])); // {sender, e}

  // process big contributors first each round -> better spread
  const order = [...names].sort((a, b) => E[b] - E[a]);
  const maxRounds = Math.max(...Object.values(N));

  for (let round = 0; round < maxRounds; round++) {
    for (const sender of order) {
      if (remaining[sender] <= 0) continue;

      const eligible = names.filter(
        (n) => n !== sender && !sentTo[sender].has(n)
      );
      if (eligible.length === 0) continue;

      // pick eligible target with lowest current load (tie-break: name)
      let target = eligible[0];
      for (const cand of eligible) {
        if (
          load[cand] < load[target] ||
          (load[cand] === load[target] && cand < target)
        ) {
          target = cand;
        }
      }

      sentTo[sender].add(target);
      incoming[target].push({ sender, e: E[sender] });
      load[target] += E[sender];
      remaining[sender] -= 1;
    }
  }

  return { E, sentTo, incoming, load, names };
}

function printResults({ E, sentTo, incoming, load, names }) {
  const round = (n) => Math.round(n);

  for (const n of names) {
    console.log(`\n${n} will reinforce:`);
    [...sentTo[n]]
      .sort()
      .forEach((t, i) => console.log(`  ${i + 1}. ${t}: ${round(E[n])}`));

    const total = incoming[n].reduce((sum, x) => sum + x.e, 0);
    console.log(`${n} will be reinforced by (total: ${round(total)}):`);
    [...incoming[n]]
      .sort((a, b) => a.sender.localeCompare(b.sender))
      .forEach((x, i) => console.log(`  ${i + 1}. ${x.sender}: ${round(x.e)}`));
  }

  console.log("\n\nLOAD SUMMARY:");
  [...names]
    .sort((a, b) => load[a] - load[b])
    .forEach((n) => console.log(`${n}: ${round(load[n])}`));
}

const result = solve(players);
printResults(result);

module.exports = { solve, players };