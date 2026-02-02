import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import Product from './models/Product';
import Sale from './models/Sale';
import SaleItem from './models/SaleItem';

const adapter = new SQLiteAdapter({
  schema,
  // (Optional) API for easier migrations
  // migrations,
  jsi: true, // If using TurboModules
  onSetUpError: error => {
    // Database failed to load -- setup recovery
  }
});

export const database = new Database({
  adapter,
  modelClasses: [
    Product,
    Sale,
    SaleItem
  ],
});
