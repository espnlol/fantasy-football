import fs from 'node:fs';
import path from 'node:path';
import { normalizeTeam } from '../lib/teams';

interface CoordinatorsConfig {
  meta: { asOf: string; confidence: string; note: string };
  defensiveCoordinators: Record<string, string | null>;
}

let cached: CoordinatorsConfig | null = null;

function load(): CoordinatorsConfig {
  if (cached) return cached;
  const file = path.join(__dirname, '..', '..', 'config', 'coordinators.json');
  cached = JSON.parse(fs.readFileSync(file, 'utf8')) as CoordinatorsConfig;
  return cached;
}

export interface DcInfo {
  name: string | null;
  asOf: string;
  confidence: string;
}

export function getDefensiveCoordinator(team: string): DcInfo {
  const cfg = load();
  const name = cfg.defensiveCoordinators[normalizeTeam(team)] ?? null;
  return { name, asOf: cfg.meta.asOf, confidence: cfg.meta.confidence };
}

export function coordinatorsMeta(): CoordinatorsConfig['meta'] {
  return load().meta;
}
