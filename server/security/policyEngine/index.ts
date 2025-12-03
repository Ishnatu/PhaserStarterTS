import type { RequestContext, PolicyDecision } from '../events/types';
import { isBanned, addTempBan } from '../tier1';
import { securityEventBus } from '../events/eventBus';

interface PolicyRule {
  id: string;
  condition: (context: RequestContext, state: PolicyState) => boolean;
  action: (context: RequestContext) => PolicyDecision;
  priority: number;
}

interface PolicyState {
  recentViolations: Map<string, number>;
}

const state: PolicyState = {
  recentViolations: new Map(),
};

const rules: PolicyRule[] = [
  {
    id: 'banned_player',
    priority: 100,
    condition: (ctx) => isBanned(ctx.playerId),
    action: () => ({ allow: false, reason: 'Account temporarily suspended' }),
  },
  {
    id: 'repeated_violations',
    priority: 90,
    condition: (ctx, state) => {
      const violations = state.recentViolations.get(ctx.playerId) || 0;
      return violations > 10;
    },
    action: (ctx) => {
      addTempBan(ctx.playerId, 5 * 60 * 1000);
      return { 
        allow: false, 
        reason: 'Too many violations, temporary cooldown applied',
        actions: [{ type: 'TEMP_BAN', durationMs: 5 * 60 * 1000 }]
      };
    },
  },
];

export function evaluate(context: RequestContext): PolicyDecision {
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    if (rule.condition(context, state)) {
      return rule.action(context);
    }
  }

  return { allow: true };
}

export function recordViolation(playerId: string): void {
  const current = state.recentViolations.get(playerId) || 0;
  state.recentViolations.set(playerId, current + 1);

  securityEventBus.emitQuick(playerId, 'VIOLATION_RECORDED', 'MEDIUM', {
    totalViolations: current + 1,
  });
}

export function clearViolations(playerId: string): void {
  state.recentViolations.delete(playerId);
}

export function decayViolations(): void {
  for (const [playerId, count] of state.recentViolations.entries()) {
    if (count <= 1) {
      state.recentViolations.delete(playerId);
    } else {
      state.recentViolations.set(playerId, count - 1);
    }
  }
}

setInterval(decayViolations, 60000);
