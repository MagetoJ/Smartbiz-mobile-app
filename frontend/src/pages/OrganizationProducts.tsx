import { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Package,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Building2
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  api,
  OrganizationProduct,
  OrganizationCategory,
  OrganizationProductCreate,
  OrganizationProductUpdate,
  Branch
} from '../lib/api';
import { Card, CardContent } from '../components/ui/Card';
import { formatCurrency } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function OrganizationProducts() {
  const { token, organization, isBranchTenant } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<OrganizationProduct[]>([]);
  const [categories, setCategories] = useState<OrganizationCategory[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<OrganizationProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<OrganizationProductCreate>({
    name: '',
    sku: '',
    description: '',
    base_cost: 0,
    selling_price: 0,
    target_margin: 25,
    minimum_margin: 15,
    category_id: undefined,
    unit: 'pcs',
    reorder_level: 10,
    is_available: true,
    is_service: false
  });

  // Redirect if not part of an organization
  useEffect(() => {
    if (!isBranchTenant) {
      navigate('/settings');
    }
  }, [isBranchTenant, navigate]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!token) return;

    setLoading(true);
    try {
      const [productsData, categoriesData, branchesData] = await Promise.all([
        api.getOrgProducts(token, selectedCategory || undefined),
        api.getOrgCategories(token),
        api.getBranches(token)
      ]);

      setProducts(productsData);
      setCategories(categoriesData);
      setBranches(branchesData);
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      sku: '',
      description: '',
      base_cost: 0,
      selling_price: 0,
      target_margin: 25,
      minimum_margin: 15,
      category_id: undefined,
      unit: 'pcs',
      reorder_level: 10,
      is_available: true,
      is_service: false
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product: OrganizationProduct) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      description: product.description,
      base_cost: product.base_cost,
      selling_price: product.selling_price,
      target_margin: product.target_margin,
      minimum_margin: product.minimum_margin,
      category_id: product.category_id,
      unit: product.unit,
      reorder_level: product.reorder_level,
      is_available: product.is_available,
      is_service: product.is_service
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      if (editingProduct) {
        await api.updateOrgProduct(token, editingProduct.id, formData as OrganizationProductUpdate);
        setSuccess('Product updated successfully');
      } else {
        await api.createOrgProduct(token, formData);
        setSuccess('Product created successfully');
      }

      setIsModalOpen(false);
      loadData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to save product');
    }
  };

  const handleDelete = async (productId: number, productName: string) => {
    if (!token) return;
    if (!confirm(`Are you sure you want to delete "${productName}"? This will remove it from ALL branches.`)) {
      return;
    }

    try {
      await api.deleteOrgProduct(token, productId);
      setSuccess('Product deleted successfully');
      loadData();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete product');
    }
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-gray-700" />
                <h1 className="text-2xl font-bold text-gray-900">Organization Products</h1>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Manage the shared product catalog for {organization?.name}
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">×</button>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={selectedCategory || ''}
              onChange={(e) => {
                setSelectedCategory(e.target.value ? parseInt(e.target.value) : null);
                loadData();
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchTerm ? 'No products found matching your search.' : 'No products yet. Add your first product to get started.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <Card key={product.id}>
              <CardContent className="py-4">
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                      <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id, product.name)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {product.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{product.description}</p>
                  )}

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Base Cost:</span>
                      <span className="font-medium">{formatCurrency(product.base_cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Selling Price:</span>
                      <span className="font-medium">{formatCurrency(product.selling_price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Unit:</span>
                      <span className="font-medium">{product.unit}</span>
                    </div>
                    {product.category_rel && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Category:</span>
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {product.category_rel.name}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Building2 className="h-3 w-3" />
                      <span>Available in {branches.length} {branches.length === 1 ? 'branch' : 'branches'}</span>
                    </div>
                  </div>

                  <div className="mt-2 flex gap-2">
                    {product.is_service && (
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        Service
                      </span>
                    )}
                    {!product.is_available && (
                      <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">
                        Unavailable
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Product Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    required
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="pcs, kg, liters"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category_id || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, category_id: e.target.value ? parseInt(e.target.value) : undefined })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">No Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Cost <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.base_cost}
                    onChange={(e) => setFormData({ ...formData, base_cost: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Selling Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.selling_price}
                    onChange={(e) => setFormData({ ...formData, selling_price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reorder_level}
                    onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="col-span-2 flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_service}
                      onChange={(e) => setFormData({ ...formData, is_service: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">This is a service (not a physical product)</span>
                  </label>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  Note: This product will be added to all branches. Each branch will track its own stock quantities.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
