import type { PlayerStats, ScoreBreakdown, SlotRole } from './types';

export function getScoreBreakdown(
  player: PlayerStats | undefined,
  role: SlotRole | null,
  isFT: boolean,
): ScoreBreakdown {
  if (!player) {
    return { fouls: 0, yellows: 0, reds: 0, polite: 0, total: 0 };
  }

  const foulMultiplier = role === 'Hitman' ? 1.5 : 1;
  const yellowMultiplier = role === 'HotHead' ? 1.5 : 1;
  const redMultiplier = role === 'LooseCannon' ? 1.5 : 1;

  const fouls = player.fouls * (5 * foulMultiplier);
  const yellows = player.yellowCards.length * (20 * yellowMultiplier);
  const reds = player.redCards.length > 0 ? 50 * redMultiplier : 0;
  const polite =
    isFT &&
    player.fouls === 0 &&
    player.yellowCards.length === 0 &&
    player.redCards.length === 0
      ? -15
      : 0;

  return {
    fouls,
    yellows,
    reds,
    polite,
    total: fouls + yellows + reds + polite,
  };
}

export function calculatePlayerScore(
  player: PlayerStats | undefined,
  role: SlotRole | null,
  isFT: boolean,
) {
  return getScoreBreakdown(player, role, isFT).total;
}
