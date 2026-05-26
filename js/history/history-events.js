window.CR = window.CR || {};

(() => {
  const CR = window.CR;
  const SIDES = [0, 1];

  async function upsertGameUserScore(db, gameId, userId, points) {
    if (!userId) return;
    const res = await db.from('game_user_scores').upsert({
      game_id: gameId,
      user_id: userId,
      points: Number(points || 0)
    }, { onConflict: 'game_id,user_id' });
    if (res.error) throw res.error;
  }
})();