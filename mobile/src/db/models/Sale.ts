import { Model, Relation } from '@nozbe/watermelondb';
import { field, date, readonly, relation, children } from '@nozbe/watermelondb/decorators';
import SaleItem from './SaleItem';

export default class Sale extends Model {
  static table = 'sales';

  @field('total_amount') totalAmount!: number;
  @field('customer_id') customerId?: number;
  @field('status') status!: string;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;

  @children('sale_items') saleItems!: any; // SaleItem[]
}
