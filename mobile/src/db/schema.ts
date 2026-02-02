import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'products',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'sku', type: 'string', isOptional: true },
        { name: 'price', type: 'number' },
        { name: 'category_id', type: 'number', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sales',
      columns: [
        { name: 'total_amount', type: 'number' },
        { name: 'customer_id', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'sale_items',
      columns: [
        { name: 'sale_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'quantity', type: 'number' },
        { name: 'unit_price', type: 'number' },
        { name: 'subtotal', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'phone', type: 'string', isOptional: true },
      ],
    }),
  ],
});
