import { apiSuite } from '../testkit/apiSuite.js';
import { createMemoryStore } from '../testkit/memoryStore.js';

// Runs every time, with no database needed.
apiSuite('API with the in-memory store', {
  makeStore: () => createMemoryStore(),
  async seedLegacy(store, legacy) {
    store.seedLegacy(legacy);
  },
  async inspect(store, ownerId) {
    const { photos, sites } = store.dump();
    return { photos: photos.filter((p) => p.owner === ownerId).length, sites: sites.filter((s) => s.owner === ownerId).length };
  },
});
