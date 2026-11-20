const STORAGE_KEY = 'mayhemate.session.v1';

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  if (!session || session.role === 'local' || !session.code) {
    return;
  }

  const target = storage();
  if (!target) {
    return;
  }

  try {
    target.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        role: session.role,
        code: session.code,
        localColor: session.localColor,
        seq: session.seq,
        game: session.toState(),
      })
    );
  } catch {
    return;
  }
}

export function loadSession() {
  const target = storage();
  if (!target) {
    return null;
  }

  try {
    const raw = target.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw);
    if (
      data?.v !== 1 ||
      (data.role !== 'host' && data.role !== 'guest') ||
      typeof data.code !== 'string' ||
      !data.code ||
      !Array.isArray(data.game?.pieces)
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  const target = storage();
  if (!target) {
    return;
  }

  try {
    target.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
