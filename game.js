import { active } from './core.js?v=12';

export const isComplete = (type, record) => !!record && (type === 'tasks' ? record.done === true : record.progress === 100);
export function rewardFor(type, record) {
  const multiplier = record.effort || 1, amount = (type === 'tasks' ? 1 : 5) * multiplier;
  return { xp: (type === 'tasks' ? 10 : 50) * multiplier, coins: record.profitable ? 0 : amount, gold: record.profitable ? amount : 0 };
}
// One award ID per source: completing again never creates a second credit.
export function updateAward(state, type, record, previous) {
  if (!['tasks', 'goals'].includes(type)) return;
  const id = `${type}.${record.id}`, index = state.awards.findIndex(a => a.id === id), completed = isComplete(type, record);
  const existing = state.awards[index]?.deleted ? null : state.awards[index];
  if (!existing && (!completed || isComplete(type, previous))) return;
  const award = { id, title: record.title, notes: '', sourceType: type, sourceId: record.id, earned: completed, ...(existing ? { xp: existing.xp, coins: existing.coins, gold: existing.gold } : rewardFor(type, record)), updatedAt: record.updatedAt, deleted: false };
  if (index === -1) state.awards.push(award); else state.awards[index] = award;
}
export function resetGame(state, mode, updatedAt) {
  if (!['coins', 'all'].includes(mode)) throw new Error('Выберите вариант сброса.');
  const erase = record => record.deleted ? record : { id: record.id, deleted: true, updatedAt };
  return { ...state,
    awards: state.awards.map(a => mode === 'all' ? erase(a) : a.deleted ? a : { ...a, coins: 0, gold: 0, updatedAt }),
    routineChecks: (state.routineChecks || []).map(c => c.deleted ? c : { ...c, coinsEligible: false, ...(mode === 'all' ? { xpEligible: false } : {}), updatedAt }),
    purchases: state.purchases.map(erase)
  };
}
export function earnedAwards(state) {
  const sources = { tasks: new Map(state.tasks.map(t => [t.id, t])), goals: new Map(state.goals.map(g => [g.id, g])) };
  return active(state.awards).filter(award => {
    const source = sources[award.sourceType].get(award.sourceId);
    return source && !source.deleted ? isComplete(award.sourceType, source) : award.earned;
  });
}
export function gameTotals(state) {
  const totals = earnedAwards(state).reduce((sum, award) => ({ xp: sum.xp + award.xp, coins: sum.coins + award.coins, gold: sum.gold + award.gold }), { xp: 0, coins: 0, gold: 0 });
  const routines = routineTotals(state); totals.xp += routines.xp; totals.coins += routines.coins;
  for (const purchase of active(state.purchases)) totals[purchase.currency] -= purchase.cost;
  return { ...totals, level: Math.floor(totals.xp / 100) + 1, progress: totals.xp % 100, next: 100 - totals.xp % 100 };
}
export function routineStats(state, routineId) {
  const checks = active(state.routineChecks || []).filter(c => c.routineId === routineId && c.done);
  const paid = checks.filter(c => c.coinsEligible).length;
  return { count: checks.length, xp: checks.filter(c => c.xpEligible).length * 5, coins: Math.floor(paid / 3), progress: paid % 3 };
}
export function routineTotals(state) {
  const ids = new Set(active(state.routineChecks || []).map(c => c.routineId));
  return [...ids].reduce((sum, id) => { const stats = routineStats(state, id); return { xp: sum.xp + stats.xp, coins: sum.coins + stats.coins }; }, { xp: 0, coins: 0 });
}
export function purchaseWish(state, wishId, id, updatedAt) {
  const wish = active(state.wishes).find(w => w.id === wishId);
  if (!wish) throw new Error('Желание уже удалено.');
  if (!wish.repeatable && active(state.purchases).some(p => p.wishId === wishId)) throw new Error('Это желание уже куплено.');
  if (gameTotals(state)[wish.currency] < wish.cost) throw new Error('Пока не хватает монет. Продолжайте выполнять свои дела.');
  return { id, title: wish.title, notes: wish.notes, wishId, cost: wish.cost, currency: wish.currency, fulfilled: false, updatedAt, deleted: false };
}
