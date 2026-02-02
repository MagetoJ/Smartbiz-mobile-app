import { Model, Relation } from '@nozbe/watermelondb';
import { field, relation } from '@nozbe/watermelondb/decorators';
import Sale from './Sale';
import Product from './Product';

export default class SaleItem extends Model {
  static table = 'sale_items';

  @relation('sales', 'sale_id') sale!: Relation<Sale>;
  @relation('products', 'product_id') product!: Relation<Product>;
  
  @field('quantity') quantity!: number;
  @field('unit_price') unitPrice!: number;
  @field('subtotal') subtotal!: number;
}
