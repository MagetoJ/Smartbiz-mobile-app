import { useState, useEffect } from 'react';
import { Sparkles, Edit2, Save, X, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';
import { api, Category } from '../lib/api';

interface EditForm {
  target_margin: string;
  minimum_margin: string;
}

export default function Categories() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<number, EditForm>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await api.getCategories(token!, false);
      setCategories(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setError('Failed to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCategories();
    }
  }, [token]);

  const startEditing = (category: Category) => {
    setEditingId(category.id);
    setEditForm({
      ...editForm,
      [category.id]: {
        target_margin: category.target_margin?.toString() ?? '',
        minimum_margin: category.minimum_margin?.toString() ?? '',
      },
    });
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setError(null);
  };

  const saveMargins = async (categoryId: number) => {
    const form = editForm[categoryId];

    // Validate inputs
    const targetValue = form.target_margin === '' ? null : parseFloat(form.target_margin);
    const minimumValue = form.minimum_margin === '' ? null : parseFloat(form.minimum_margin);

    // Check if values are valid numbers or null
    if (targetValue !== null && (isNaN(targetValue) || targetValue < 0 || targetValue > 100)) {
      setError('Target margin must be between 0 and 100%');
      return;
    }

    if (minimumValue !== null && (isNaN(minimumValue) || minimumValue < 0 || minimumValue > 100)) {
      setError('Minimum margin must be between 0 and 100%');
      return;
    }

    // Validate: minimum cannot exceed target
    if (targetValue !== null && minimumValue !== null && minimumValue > targetValue) {
      setError('Minimum margin cannot be greater than target margin');
      return;
    }

    try {
      setSavingId(categoryId);
      await api.updateCategory(token!, categoryId, {
        target_margin: targetValue,
        minimum_margin: minimumValue,
      });
      await fetchCategories();
      setEditingId(null);
      setError(null);
    } catch (err) {
      console.error('Failed to save margins:', err);
      setError('Failed to save margins. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const resetToDefaults = async (categoryId: number) => {
    if (!confirm('Reset this category to system defaults (25% target, 15% minimum)?')) {
      return;
    }

    try {
      setSavingId(categoryId);
      await api.updateCategory(token!, categoryId, {
        target_margin: null,
        minimum_margin: null,
      });
      await fetchCategories();
      setError(null);
    } catch (err) {
      console.error('Failed to reset margins:', err);
      setError('Failed to reset margins. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const isUsingDefaults = (category: Category) => {
    return category.target_margin === null || category.minimum_margin === null;
  };

  const isAIGenerated = (category: Category) => {
    return category.icon === 'sparkles';
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-8 text-gray-600">Loading categories...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Desktop Table */}
      <Card className="hidden lg:block">
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Products
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Target Margin (%)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Minimum Margin (%)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.map((category) => {
                  const isEditing = editingId === category.id;
                  const isSaving = savingId === category.id;

                  return (
                    <tr key={category.id} className={isSaving ? 'opacity-50' : ''}>
                      {/* Category Name */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isAIGenerated(category) && (
                            <span title="AI-generated">
                              <Sparkles className="h-4 w-4 text-purple-500" />
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {category.name}
                          </span>
                          {isUsingDefaults(category) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              Default
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Product Count */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {category.product_count ?? 0}
                      </td>

                      {/* Target Margin */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="Default (25)"
                            value={editForm[category.id]?.target_margin ?? ''}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                [category.id]: {
                                  ...editForm[category.id],
                                  target_margin: e.target.value,
                                },
                              })
                            }
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            disabled={isSaving}
                          />
                        ) : (
                          <span className="text-sm text-gray-900">
                            {category.effective_target_margin.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      {/* Minimum Margin */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            placeholder="Default (15)"
                            value={editForm[category.id]?.minimum_margin ?? ''}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                [category.id]: {
                                  ...editForm[category.id],
                                  minimum_margin: e.target.value,
                                },
                              })
                            }
                            className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                            disabled={isSaving}
                          />
                        ) : (
                          <span className="text-sm text-gray-900">
                            {category.effective_minimum_margin.toFixed(1)}%
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveMargins(category.id)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-900 disabled:opacity-50"
                              title="Save"
                            >
                              <Save className="h-4 w-4" />
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 disabled:opacity-50"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEditing(category)}
                              disabled={isSaving}
                              className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-900 disabled:opacity-50"
                              title="Edit Margins"
                            >
                              <Edit2 className="h-4 w-4" />
                              Edit
                            </button>
                            {!isUsingDefaults(category) && (
                              <button
                                onClick={() => resetToDefaults(category.id)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 disabled:opacity-50"
                                title="Reset to Defaults"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Reset
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {categories.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              No categories found. Categories are automatically created when products are added.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="lg:hidden space-y-4">
        {categories.map((category) => {
          const isEditing = editingId === category.id;
          const isSaving = savingId === category.id;

          return (
            <Card key={category.id} className={isSaving ? 'opacity-50' : ''}>
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {isAIGenerated(category) && (
                        <span title="AI-generated">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900">{category.name}</h3>
                      {isUsingDefaults(category) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      {category.product_count ?? 0} products
                    </p>
                  </div>
                </div>

                {/* Margin Info */}
                <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Target Margin</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="Default (25)"
                        value={editForm[category.id]?.target_margin ?? ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            [category.id]: {
                              ...editForm[category.id],
                              target_margin: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        disabled={isSaving}
                      />
                    ) : (
                      <p className="font-medium text-gray-900">
                        {category.effective_target_margin.toFixed(1)}%
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Minimum Margin</p>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="Default (15)"
                        value={editForm[category.id]?.minimum_margin ?? ''}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            [category.id]: {
                              ...editForm[category.id],
                              minimum_margin: e.target.value,
                            },
                          })
                        }
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                        disabled={isSaving}
                      />
                    ) : (
                      <p className="font-medium text-gray-900">
                        {category.effective_minimum_margin.toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveMargins(category.id)}
                        disabled={isSaving}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditing(category)}
                        disabled={isSaving}
                        className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-primary-600 bg-white border border-primary-600 hover:bg-primary-50 rounded-md disabled:opacity-50"
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </button>
                      {!isUsingDefaults(category) && (
                        <button
                          onClick={() => resetToDefaults(category.id)}
                          disabled={isSaving}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reset
                        </button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {categories.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-600">
              No categories found. Categories are automatically created when products are added.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <p>
          <strong>System Defaults:</strong> Target margin 25%, Minimum margin 15%
        </p>
        <p>
          Categories marked with <Sparkles className="inline h-3 w-3 text-purple-500" /> were automatically generated by AI.
        </p>
        <p>
          Leave fields empty to use system defaults. New products will inherit margins from their category.
        </p>
      </div>
    </div>
  );
}
