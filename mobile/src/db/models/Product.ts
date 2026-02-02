import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Product extends Model {
  static table = 'products';

  @field('name') name!: string;
  @field('sku') sku?: string;
  @field('price') price!: number;
  @field('category_id') categoryId?: number;
  @field('is_active') isActive!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
