import { randomInt } from "node:crypto";

export function hasAllowedSecretSantaRole(
  userRoles: readonly string[] | undefined,
  allowedRoleIds: readonly string[] | undefined,
): boolean {
  const allowed = (allowedRoleIds ?? []).map(String).filter(Boolean);
  if (!allowed.length) return true;
  const set = new Set((userRoles ?? []).map(String));
  return allowed.some((id) => set.has(id));
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Randomized backtracking derangement solver.
 * Guarantees no self-matches, honors all bidirectional exclusion pairs,
 * and avoids mutual 2-cycles (A <-> B) when possible for >= 4 participants.
 */
export function solveSecretSantaMatching(
  participantIds: readonly string[],
  exclusions: ReadonlyArray<readonly [string, string]>,
): Map<string, string> | null {
  const ids = [...new Set(participantIds.map(String))];
  if (ids.length < 3) return null;

  const blocked = new Map<string, Set<string>>();
  for (const id of ids) blocked.set(id, new Set([id]));
  for (const [a, b] of exclusions) {
    blocked.get(String(a))?.add(String(b));
    blocked.get(String(b))?.add(String(a));
  }

  const attempt = (forbidTwoCycles: boolean): Map<string, string> | null => {
    const candidates = new Map<string, string[]>();
    for (const id of ids) {
      const ban = blocked.get(id)!;
      const list = shuffle(ids.filter((other) => !ban.has(other)));
      if (!list.length) return null;
      candidates.set(id, list);
    }
    const order = shuffle(ids).sort((a, b) => candidates.get(a)!.length - candidates.get(b)!.length);
    const assigned = new Map<string, string>();
    const usedRecipients = new Set<string>();
    let steps = 0;
    const maxSteps = 50_000;

    const dfs = (index: number): boolean => {
      if (index === order.length) return true;
      if (++steps > maxSteps) return false;
      const giver = order[index];
      for (const recipient of candidates.get(giver)!) {
        if (usedRecipients.has(recipient)) continue;
        if (forbidTwoCycles && assigned.get(recipient) === giver) continue;
        assigned.set(giver, recipient);
        usedRecipients.add(recipient);
        if (dfs(index + 1)) return true;
        assigned.delete(giver);
        usedRecipients.delete(recipient);
      }
      return false;
    };

    return dfs(0) ? assigned : null;
  };

  if (ids.length >= 4) {
    const noTwoCycles = attempt(true);
    if (noTwoCycles) return noTwoCycles;
  }
  return attempt(false);
}
