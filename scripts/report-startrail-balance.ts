import { pilots, simulateExpedition, simulationStages } from './startrail-balance.ts';

const seeds = 24;
const mean = (values: number[]) => +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
const results = simulationStages.flatMap(stage => Object.entries(pilots).flatMap(([pilot, traits]) => ([1, 2] as const).map(explorers => {
  const runs = Array.from({ length: seeds }, (_, i) => simulateExpedition(stage, traits, explorers, i + 1));
  return {
    stage: stage.id, pilot, explorers, cleared: `${runs.filter(run => run.cleared).length}/${seeds}`,
    time: mean(runs.map(run => run.time)), killsPerMinute: mean(runs.map(run => 60 * run.kills / run.time)),
    peakEnemies: mean(runs.map(run => run.peak)), endHp: mean(runs.map(run => run.hp)),
    dryRuns: runs.filter(run => run.ammoStops > 0).length,
    escortKills: mean(runs.map(run => run.escortKills)), escortDamage: mean(runs.map(run => run.escortDamage)),
  };
})));
console.table(results);
