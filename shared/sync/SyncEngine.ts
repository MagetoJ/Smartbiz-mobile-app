// src/shared/sync/SyncEngine.ts
import { apiClient } from "../api/endpoints";
import { Sale } from "../schemas/sale.schema";

export class SyncEngine {
  private isSyncing = false;

  async syncPendingSales() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pendingSales: Sale[] = await this.getLocalUnsyncedSales();

      for (const sale of pendingSales) {
        await apiClient.post("/sales/sync", sale);
        await this.markSaleAsSynced(sale.id);
      }
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  private async getLocalUnsyncedSales(): Promise<Sale[]> {
    // WatermelonDB or SQLite query here
    // This should be implemented by the platform-specific DB adapter
    return [];
  }

  private async markSaleAsSynced(id: string) {
    // WatermelonDB or SQLite update here
  }
}
