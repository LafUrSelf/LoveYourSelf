/*
 * storage-shim.js
 * -----------------------------------------------------------------------
 * The site was originally built to run inside an environment that
 * provides a persistent, server-side `window.storage` API (get / set /
 * list / delete), where data marked "shared" is visible to every visitor
 * and data marked "personal" is visible only to the current user.
 *
 * GitHub Pages is 100% static hosting — there is no server and no
 * database. This shim re-implements the same `window.storage` interface
 * on top of the browser's localStorage so the app keeps working without
 * any code changes.
 *
 * IMPORTANT LIMITATION — please read before publishing:
 * localStorage lives only in ONE visitor's browser. That means:
 *   - Services, masters and site text an admin edits are only visible
 *     in the browser where the admin edited them — other visitors will
 *     NOT see those changes.
 *   - Client accounts, bookings and loyalty balances registered in one
 *     browser are invisible in any other browser or device, and are
 *     lost if that visitor clears their browser data.
 *   - There is effectively no real difference between "shared" and
 *     "personal" data here — both live in the same browser's storage.
 *
 * In short: this shim is fine for a demo, a portfolio piece, or local
 * testing, but it is NOT a substitute for a real backend/database if
 * you need the catalog, bookings and user accounts to be the same for
 * every visitor. For that you need an actual backend (see README.md
 * for suggestions).
 * -----------------------------------------------------------------------
 */
(function () {
  if (window.storage) return; // don't override a real implementation if one exists

  const NS = 'lyubi-sebya:'; // namespace so this app doesn't collide with other localStorage data
  const key = (k, shared) => NS + (shared ? 'shared:' : 'private:') + k;

  window.storage = {
    async get(k, shared) {
      try {
        const raw = localStorage.getItem(key(k, shared));
        if (raw === null || raw === undefined) return null;
        return { key: k, value: raw, shared: !!shared };
      } catch (e) {
        console.error('storage.get failed', e);
        return null;
      }
    },

    async set(k, value, shared) {
      try {
        localStorage.setItem(key(k, shared), value);
        return { key: k, value, shared: !!shared };
      } catch (e) {
        console.error('storage.set failed', e);
        return null;
      }
    },

    async delete(k, shared) {
      try {
        const storageKey = key(k, shared);
        const existed = localStorage.getItem(storageKey) !== null;
        localStorage.removeItem(storageKey);
        return { key: k, deleted: existed, shared: !!shared };
      } catch (e) {
        console.error('storage.delete failed', e);
        return null;
      }
    },

    async list(prefix, shared) {
      try {
        const full = key(prefix || '', shared);
        const stripLen = NS.length + (shared ? 'shared:'.length : 'private:'.length);
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(full)) keys.push(k.slice(stripLen));
        }
        return { keys, prefix, shared: !!shared };
      } catch (e) {
        console.error('storage.list failed', e);
        return { keys: [], prefix, shared: !!shared };
      }
    }
  };
})();
