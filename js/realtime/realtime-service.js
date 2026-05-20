window.CR = window.CR || {};
window.CR.realtime = window.CR.realtime || {};

(() => {
  const CR = window.CR;
  const handlers = new Map();
  const pendingByHandler = new Map();
  const pendingEchoes = new Map();

  let channel = null;
  let startPromise = null;

  function echoKey(table, row = {}) {
    if (!table || !row) return '';
    if (table === 'games') return `games:${row.id}`;
    if (table === 'picks') {
      return row.id
        ? `picks:${row.id}`
        : `picks:${row.game_id}:${row.owner}:${Number(row.pick_slot)}`;
    }
    if (table === 'rivalry_events') return `rivalry_events:${row.id}`;
    return `${table}:${row.id || ''}`;
  }

  function markLocalWrite(table, row, ttl = 1500) {
    const key = echoKey(table, row);
    if (!key) return;
    pendingEchoes.set(key, Date.now() + ttl);
  }

  function shouldIgnoreEcho(payload) {
    const row = payload?.new || payload?.old || {};
    const key = echoKey(payload?.table, row);
    if (!key) return false;

    const until = pendingEchoes.get(key);
    if (!until) return false;

    pendingEchoes.delete(key);
    return Date.now() < until;
  }

  function normalizePayload(payload) {
    return {
      eventType: payload.eventType,
      schema: payload.schema,
      table: payload.table,
      commitTimestamp: payload.commit_timestamp,
      new: payload.new,
      old: payload.old,
      raw: payload
    };
  }

  function handlerWantsPayload(handler, payload) {
    if (!handler) return false;
    if (!Array.isArray(handler.tables) || !handler.tables.length) return true;
    return handler.tables.includes(payload.table);
  }

  function scheduleHandler(name, handler, payload) {
    const existing = pendingByHandler.get(name) || { payloads: [], timer: null };
    existing.payloads.push(payload);

    if (existing.timer) clearTimeout(existing.timer);
    existing.timer = setTimeout(async () => {
      pendingByHandler.delete(name);
      try {
        await handler.onChange?.(existing.payloads.slice());
      } catch (error) {
        console.error(`Realtime handler failed: ${name}`, error);
      }
    }, Number(handler.debounceMs ?? 180));

    pendingByHandler.set(name, existing);
  }

  function dispatch(payload) {
    if (shouldIgnoreEcho(payload)) return;

    handlers.forEach((handler, name) => {
      if (!handlerWantsPayload(handler, payload)) return;
      scheduleHandler(name, handler, payload);
    });
  }

  function register(name, handler = {}) {
    if (!name || typeof handler.onChange !== 'function') return;
    handlers.set(name, handler);
  }

  function unregister(name) {
    handlers.delete(name);
    const pending = pendingByHandler.get(name);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingByHandler.delete(name);
  }

  async function start() {
    if (channel) return channel;
    if (startPromise) return startPromise;

    startPromise = (async () => {
      const db = await CR.getSupabase();
      channel = db
        .channel('canes-rivalry-v2-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (payload) => dispatch(normalizePayload(payload)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, (payload) => dispatch(normalizePayload(payload)))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rivalry_events' }, (payload) => dispatch(normalizePayload(payload)))
        .subscribe((status) => {
          CR.realtime.status = status;
          console.log('V2 realtime status:', status);
        });

      return channel;
    })();

    return startPromise;
  }

  CR.realtime.register = register;
  CR.realtime.unregister = unregister;
  CR.realtime.start = start;
  CR.realtime.markLocalWrite = markLocalWrite;
  CR.realtime.shouldIgnoreEcho = shouldIgnoreEcho;
  CR.realtime.echoKey = echoKey;
})();
