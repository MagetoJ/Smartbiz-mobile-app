import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { api, Unit, UnitCreate, UnitUpdate } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Units() {
  const { token } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState<UnitCreate>({
    name: '',
    display_order: 0,
    is_active: true,
  });

  useEffect(() => {
    fetchUnits();
  }, [token]);

  const fetchUnits = async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const data = await api.getUnits(token, false); // Get all units including inactive
      setUnits(data);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to load units');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isEditing && editingUnit) {
        // Update existing unit
        const updateData: UnitUpdate = {
          name: formData.name !== editingUnit.name ? formData.name : undefined,
          display_order: formData.display_order !== editingUnit.display_order ? formData.display_order : undefined,
          is_active: formData.is_active !== editingUnit.is_active ? formData.is_active : undefined,
        };

        await api.updateUnit(token!, editingUnit.id, updateData);
        setSuccessMessage('Unit updated successfully');
      } else {
        // Create new unit
        await api.createUnit(token!, formData);
        setSuccessMessage('Unit created successfully');
      }

      setIsModalOpen(false);
      resetForm();
      fetchUnits();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to save unit');
    }
  };

  const handleEdit = (unit: Unit) => {
    setIsEditing(true);
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      display_order: unit.display_order,
      is_active: unit.is_active,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (unit: Unit) => {
    if (!confirm(`Are you sure you want to delete "${unit.name}"? This action cannot be undone.`)) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    try {
      await api.deleteUnit(token!, unit.id);
      setSuccessMessage('Unit deleted successfully');
      fetchUnits();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to delete unit');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      display_order: 0,
      is_active: true,
    });
    setIsEditing(false);
    setEditingUnit(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Units</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage product units of measurement
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Add Unit
        </Button>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Units List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-gray-600">Loading units...</p>
        </div>
      ) : units.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No units yet</h3>
            <p className="text-gray-600 mb-4">
              Create your first unit to start organizing products
            </p>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4 mr-2" />
              Create Unit
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Display Order
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Products
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {units
                    .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
                    .map((unit) => (
                      <tr key={unit.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{unit.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{unit.display_order}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {unit.product_count || 0} product{unit.product_count !== 1 ? 's' : ''}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={unit.is_active ? 'success' : 'secondary'}>
                            {unit.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(unit)}
                              className="text-primary-600 hover:text-primary-900"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(unit)}
                              className="text-red-600 hover:text-red-900"
                              disabled={Boolean(unit.product_count && unit.product_count > 0)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {isEditing ? 'Edit Unit' : 'Create Unit'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Unit Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Unit Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., pcs, kg, liters, meters"
                    maxLength={30}
                  />
                  <p className="text-xs text-gray-500">
                    Common units: pcs (pieces), kg, g, liters, ml, meters, cm
                  </p>
                </div>

                {/* Display Order */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Display Order
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500">
                    Lower numbers appear first in lists
                  </p>
                </div>

                {/* Active Status */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Active (available for new products)
                  </label>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={closeModal} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    {isEditing ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
