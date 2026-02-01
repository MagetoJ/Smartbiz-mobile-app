import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/contexts/ProductContext';
import { api, Product, ProductCreate, ProductUpdate, Category, Unit, StockMovement } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Plus, Search, X, AlertCircle, CheckCircle, Edit2, History, Package, SlidersHorizontal, Info, ScanLine, Camera } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ProductImage } from '@/components/ProductImage';
import { BranchSelector } from '@/components/BranchSelector';
import { PriceHistoryModal } from '@/components/PriceHistoryModal';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { CameraCapture } from '@/components/CameraCapture';
import imageCompression from 'browser-image-compression';

export function Inventory() {
  const { token, user, tenant, isBranchTenant, organization } = useAuth();
  const { products: contextProducts, isLoading: contextLoading, refreshProducts } = useProducts();
  const isAdmin = user?.role === 'admin';

  // Branch viewing state
  const defaultBranchId = user?.branch_id || tenant?.id || null;
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(defaultBranchId);

  // Determine if current view is editable
  // Parent organization admins have full rights across all branches
  // Use role_type instead of calculating from tenant context to avoid issues when switching branches
  const isParentOrgAdmin = user?.role_type === 'parent_org_admin';
  const isEditable = isParentOrgAdmin || !user?.branch_id || user.branch_id === selectedBranchId;

  // Determine if viewing default branch (use context) or another branch (use local fetch)
  const isViewingDefaultBranch = selectedBranchId === defaultBranchId;

  // Local products state for when viewing other branches
  const [localProducts, setLocalProducts] = useState<Product[]>([]);
  const [localLoading, setLocalLoading] = useState(false);

  // Use context products for default branch, local products for other branches
  const products = isViewingDefaultBranch ? contextProducts : localProducts;
  const loading = isViewingDefaultBranch ? contextLoading : localLoading;
  const [_categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Stock Management Modals
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isPriceHistoryModalOpen, setIsPriceHistoryModalOpen] = useState(false);
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<Product | null>(null);
  const [locationProduct, setLocationProduct] = useState<Product | null>(null);
  const [locationStockLoading, setLocationStockLoading] = useState(false);
  const [locationStockData, setLocationStockData] = useState<any[]>([]);

  // Stock Management Form States
  const [adjustFormData, setAdjustFormData] = useState({
    product_id: 0,
    adjustment_type: 'add' as 'add' | 'remove',
    quantity: 0,
    reason: ''
  });

  const [stockHistory, setStockHistory] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProductFilter, setHistoryProductFilter] = useState<number | null>(null);
  const [stockSuccess, setStockSuccess] = useState('');
  const [stockError, setStockError] = useState('');

  // Barcode Scanner State
  const [isAddProductScannerOpen, setIsAddProductScannerOpen] = useState(false);
  const [isAdjustScannerOpen, setIsAdjustScannerOpen] = useState(false);

  // Camera Capture State
  const [isCameraCaptureOpen, setIsCameraCaptureOpen] = useState(false);

  // Ref for auto-scrolling to image preview after camera capture
  const imageUploadSectionRef = useRef<HTMLDivElement>(null);

  // Product Search State (for Stock Adjustment)
  const [adjustProductSearch, setAdjustProductSearch] = useState('');
  const [isAdjustProductDropdownOpen, setIsAdjustProductDropdownOpen] = useState(false);

  // Unit Search State (for Add Product)
  const [unitSearch, setUnitSearch] = useState('');
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);

  // Unit Search State (for Edit Product)
  const [editUnitSearch, setEditUnitSearch] = useState('');
  const [isEditUnitDropdownOpen, setIsEditUnitDropdownOpen] = useState(false);

  // Image Upload State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form State
  const [newProduct, setNewProduct] = useState<ProductCreate>({
    name: '',
    description: '',
    barcode: '',
    unit: '',
    is_available: true,
    is_service: false,
    initial_quantity: 0  // Optional initial stock quantity
  });

  // Fetch products for non-default branches
  const fetchBranchProducts = async (branchId: number | null) => {
    if (!token || branchId === null) return;
    try {
      setLocalLoading(true);
      const viewBranchId = branchId !== tenant?.id ? branchId : undefined;
      const data = await api.getProducts(token, undefined, viewBranchId);
      setLocalProducts(data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  // Refresh products (works for both default and other branches)
  const handleRefreshProducts = async () => {
    if (isViewingDefaultBranch) {
      await refreshProducts();
    } else {
      await fetchBranchProducts(selectedBranchId);
    }
  };

  const fetchCategories = async () => {
    if (!token) return;
    try {
      const data = await api.getCategories(token, true); // Only active categories
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const fetchUnits = async () => {
    if (!token) return;
    try {
      const data = await api.getUnits(token, true); // Only active units
      setUnits(data);
    } catch (error) {
      console.error('Failed to fetch units:', error);
    }
  };

  // Fetch categories and units on mount
  useEffect(() => {
    fetchCategories();
    fetchUnits();
  }, [token]);

  // Fetch branch-specific products when viewing non-default branch
  useEffect(() => {
    if (!isViewingDefaultBranch && selectedBranchId !== null) {
      fetchBranchProducts(selectedBranchId);
    }
  }, [token, selectedBranchId, isViewingDefaultBranch]);

  // Image handling functions
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type first
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Only JPG, PNG, and WebP images are supported');
      return;
    }

    try {
      setFormError('');

      // Client-side compression options
      const options = {
        maxSizeMB: 1, // Max file size 1MB
        maxWidthOrHeight: 1200, // Max dimension 1200px
        useWebWorker: true, // Use web worker for better performance
        fileType: 'image/jpeg' as const, // Convert to JPEG
        initialQuality: 0.8 // Quality 80%
      };

      // Compress the image
      const compressedBlob = await imageCompression(file, options);
      
      // Create a proper File object from the compressed blob
      const compressedFile = new File(
        [compressedBlob], 
        file.name.replace(/\.[^/.]+$/, '.jpg'), // Change extension to .jpg
        { type: 'image/jpeg' }
      );
      
      // Show compression stats (helpful for users to see savings)
      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
      console.log(`Image compressed: ${originalSize}MB → ${compressedSize}MB`);

      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch (error) {
      console.error('Error compressing image:', error);
      setFormError('Failed to process image. Please try again.');
    }
  };

  const handleRemoveImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
  };

  const handleCameraCapture = async (file: File) => {
    // Reuse existing image selection logic
    // Camera-captured file is already a JPEG File object
    try {
      setFormError('');

      // Client-side compression options (same as file upload)
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg' as const,
        initialQuality: 0.8
      };

      // Compress the camera-captured image
      const compressedBlob = await imageCompression(file, options);

      const compressedFile = new File(
        [compressedBlob],
        file.name,
        { type: 'image/jpeg' }
      );

      const originalSize = (file.size / 1024 / 1024).toFixed(2);
      const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
      console.log(`Camera photo compressed: ${originalSize}MB → ${compressedSize}MB`);

      setImageFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));

      // Show success feedback
      setFormSuccess('✓ Photo captured successfully! Review below and fill in product details.');
      
      // Auto-scroll to image preview section after a short delay
      setTimeout(() => {
        imageUploadSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Clear success message after 4 seconds
        setTimeout(() => setFormSuccess(''), 4000);
      }, 300);
    } catch (error) {
      console.error('Error processing camera photo:', error);
      setFormError('Failed to process photo. Please try again.');
    }
  };

  const handleImageUpload = async (productId: number) => {
    if (!token || !imageFile) return;

    try {
      setUploadingImage(true);
      await api.uploadProductImage(token, productId, imageFile);
      await handleRefreshProducts();
      handleRemoveImage();
    } catch (error) {
      console.error('Failed to upload image:', error);
      setFormError('Failed to upload image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    // Validation - unit required only for physical products (not services)
    if (!newProduct.is_service && !newProduct.unit) {
      setFormError('Please select a unit before submitting.');
      setIsSubmitting(false);
      return;
    }

    try {
      // Create product (quantity always starts at 0 in backend)
      const createdProduct = await api.createProduct(token, newProduct) as Product;

      // Upload image if selected
      if (imageFile) {
        await handleImageUpload(createdProduct.id);
      }

      // If initial quantity > 0, create stock movement
      if (!newProduct.is_service && newProduct.initial_quantity && newProduct.initial_quantity > 0) {
        await api.createStockMovement(token, {
          product_id: createdProduct.id,
          movement_type: 'in',
          quantity: newProduct.initial_quantity,
          notes: 'Initial stock during product creation',
          target_branch_id: selectedBranchId ?? undefined
        });
      }

      setFormSuccess(
        `Product created successfully! SKU: ${createdProduct.sku}` +
        (newProduct.initial_quantity && newProduct.initial_quantity > 0
          ? ` with ${newProduct.initial_quantity} ${newProduct.unit} in stock.`
          : '. Use "Adjust" to add stock.')
      );

      // Reset form
      setNewProduct({
        name: '',
        description: '',
        barcode: '',
        unit: '',
        is_available: true,
        is_service: false,
        initial_quantity: 0
      });
      handleRemoveImage();

      // Refresh products
      await handleRefreshProducts();

      // Close modal after delay
      setTimeout(() => {
        setIsAddModalOpen(false);
        setFormSuccess('');
      }, 1500);
    } catch (error: any) {
      console.error('Failed to create product:', error);

      // Handle duplicate SKU error
      if (error.message?.includes('SKU already exists') || error.message?.includes('duplicate')) {
        setFormError('A product with this SKU already exists in your organization. Please use a different SKU.');
      } else {
        setFormError(error.message || 'Failed to create product. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingProduct) return;

    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    // Validate prices before submitting (only for admin users)
    let baseCost: number | undefined;
    let sellingPrice: number | undefined;

    if (isAdmin) {
      // Admin users can update prices - validate them
      baseCost = typeof newProduct.base_cost === 'string'
        ? parseFloat(newProduct.base_cost)
        : newProduct.base_cost;
      sellingPrice = typeof newProduct.selling_price === 'string'
        ? parseFloat(newProduct.selling_price)
        : newProduct.selling_price;

      if (!baseCost || baseCost <= 0) {
        setFormError('Base cost must be greater than 0 (zero). Please enter a valid price.');
        setIsSubmitting(false);
        return;
      }

      if (!sellingPrice || sellingPrice <= 0) {
        setFormError('Selling price must be greater than 0 (zero). Please enter a valid price.');
        setIsSubmitting(false);
        return;
      }
    } else {
      // Staff users cannot edit prices - preserve existing prices
      baseCost = editingProduct.base_cost ?? undefined;
      sellingPrice = editingProduct.selling_price ?? undefined;
    }

    // Prepare update data - only send changed fields
    const updateData: ProductUpdate = {};
    if (newProduct.name !== editingProduct.name) updateData.name = newProduct.name;
    if (newProduct.description !== editingProduct.description) updateData.description = newProduct.description;
    // Only update prices if admin user and prices changed
    if (isAdmin && baseCost !== editingProduct.base_cost) updateData.base_cost = baseCost;
    if (isAdmin && sellingPrice !== editingProduct.selling_price) updateData.selling_price = sellingPrice;
    if (newProduct.category_id !== editingProduct.category_id) updateData.category_id = newProduct.category_id;
    if (newProduct.unit !== editingProduct.unit) updateData.unit = newProduct.unit;
    // reorder_level removed - auto-calculated by backend
    // is_available field removed from UI - products are available by default

    try {
      await api.updateProduct(token, editingProduct.id, updateData);

      // Upload image if selected
      if (imageFile && editingProduct.id) {
        await handleImageUpload(editingProduct.id);
      }

      setFormSuccess('Product updated successfully!');

      // Refresh product list
      await handleRefreshProducts();

      // Close modal after short delay
      setTimeout(() => {
        setIsEditModalOpen(false);
        setEditingProduct(null);
        setFormSuccess('');
      }, 1500);
    } catch (error: any) {
      console.error('Failed to update product:', error);

      // Extract meaningful error message
      let errorMessage = 'Failed to update product. Please try again.';

      // Handle different error formats
      let errorText = '';
      if (error.message && typeof error.message === 'string') {
        errorText = error.message;
      } else if (typeof error === 'string') {
        errorText = error;
      } else if (error.detail) {
        errorText = error.detail;
      } else if (error.error) {
        errorText = error.error;
      } else {
        errorText = JSON.stringify(error);
      }

      // Check for specific error types
      if (errorText.toLowerCase().includes('greater than 0') ||
          errorText.toLowerCase().includes('base_cost') ||
          errorText.toLowerCase().includes('selling_price')) {
        errorMessage = 'Buying price and selling price must be greater than 0 (zero). Please enter valid prices.';
      } else if (errorText.toLowerCase().includes('duplicate') ||
          errorText.toLowerCase().includes('unique') ||
          errorText.toLowerCase().includes('already exists')) {
        errorMessage = `This SKU "${newProduct.sku}" already exists in your inventory. Please use a different SKU (Stock Keeping Unit).`;
      } else if (errorText.toLowerCase().includes('category')) {
        errorMessage = 'Invalid category selected. Please choose a valid category.';
      } else if (errorText && errorText !== '{}' && errorText !== '[object Object]') {
        errorMessage = errorText;
      }

      setFormError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (product: Product) => {
    setEditingProduct(product);
    setNewProduct({
      name: product.name,
      sku: product.sku,
      description: product.description || '',
      base_cost: product.base_cost as any,
      selling_price: product.selling_price as any,
      category_id: product.category_id,
      unit: product.unit,
      is_available: product.is_available,
      is_service: product.is_service  // NEW: Include service flag
    });
    setIsEditModalOpen(true);
    setFormError('');
    setFormSuccess('');
    // Clear image upload state
    handleRemoveImage();
  };

  // Stock Management Utility Functions
  const parseStockNotes = (notes: string) => {
    if (!notes) return null;

    const parts = notes.split(' | ');
    const parsed: Record<string, string> = {};

    parts.forEach(part => {
      const colonIndex = part.indexOf(': ');
      if (colonIndex > 0) {
        const key = part.substring(0, colonIndex);
        const value = part.substring(colonIndex + 2);
        parsed[key] = value;
      }
    });

    return parsed;
  };

  // Stock Management Handlers
  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setStockError('');
    setStockSuccess('');
    setIsSubmitting(true);

    // Validation
    if (adjustFormData.product_id === 0) {
      setStockError('Please select a product');
      setIsSubmitting(false);
      return;
    }

    if (adjustFormData.quantity <= 0) {
      setStockError('Quantity must be greater than zero');
      setIsSubmitting(false);
      return;
    }

    if (!adjustFormData.reason.trim()) {
      setStockError('Please provide a reason for this adjustment');
      setIsSubmitting(false);
      return;
    }

    // Check if removing more than available
    if (adjustFormData.adjustment_type === 'remove') {
      const product = products.find(p => p.id === adjustFormData.product_id);
      if (product && product.quantity < adjustFormData.quantity) {
        setStockError(`Cannot remove ${adjustFormData.quantity} units. Only ${product.quantity} available.`);
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const quantity = adjustFormData.adjustment_type === 'add'
        ? adjustFormData.quantity
        : -adjustFormData.quantity;

      await api.createStockMovement(token, {
        product_id: adjustFormData.product_id,
        movement_type: 'adjustment',
        quantity,
        notes: `Adjustment: ${adjustFormData.reason}`,
        target_branch_id: selectedBranchId ?? undefined
      });

      setStockSuccess('Stock adjusted successfully!');

      // Reset form
      setAdjustFormData({
        product_id: 0,
        adjustment_type: 'add',
        quantity: 0,
        reason: ''
      });

      // Refresh products
      await handleRefreshProducts();

      // Close modal after delay
      setTimeout(() => {
        setIsAdjustModalOpen(false);
        setStockSuccess('');
        setAdjustProductSearch('');
      }, 1500);
    } catch (error: any) {
      console.error('Failed to adjust stock:', error);
      setStockError(error.message || 'Failed to adjust stock. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchStockHistory = async (productId?: number) => {
    if (!token) return;

    try {
      setHistoryLoading(true);
      const history = await api.getStockHistory(token, productId);
      setStockHistory(history);
    } catch (error) {
      console.error('Failed to fetch stock history:', error);
      setStockError('Failed to load stock history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = async (productId?: number) => {
    setIsHistoryModalOpen(true);
    setHistoryProductFilter(productId || null);
    await fetchStockHistory(productId);
  };

  const handleAddProductBarcodeScanned = async (barcode: string) => {
    if (!token) {
      // Fallback: just set barcode if no token (shouldn't happen)
      setNewProduct({...newProduct, barcode: barcode});
      setIsAddProductScannerOpen(false);
      return;
    }

    try {
      // Try to find existing product with this barcode
      const product = await api.searchProductByBarcode(token, barcode);

      // Product found! Auto-populate form fields
      setNewProduct(prev => ({
        ...prev,
        name: product.name,
        description: product.description || '',
        barcode: barcode, // Use scanned barcode
        category_id: product.category_id,
        unit: product.unit,
        // Note: Do NOT copy prices (cost_price, selling_price) as they may change
        // Note: initial_quantity remains 0 (user-specific)
        // Note: is_available and is_service keep their defaults
      }));

      // Show success message with product name
      setFormSuccess(
        `Product "${product.name}" (SKU: ${product.sku}) found! ` +
        `Review details below and confirm to create.`
      );
      setTimeout(() => setFormSuccess(''), 5000);

      // Optional: Show a subtle warning that product already exists
      // (This helps prevent accidental duplicates while not blocking the action)
      console.log(`Notice: Product with barcode ${barcode} already exists (ID: ${product.id})`);
    } catch (error: any) {
      // Product not found - this is normal for new products
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        // Just set the barcode, user will fill in the rest
        setNewProduct(prev => ({...prev, barcode: barcode}));

        // Show informational message (not an error)
        setFormSuccess(
          `New product! Barcode "${barcode}" captured. Enter details below.`
        );
        setTimeout(() => setFormSuccess(''), 4000);
      } else {
        // Actual error (network, permission, etc.)
        console.error('Error searching for product by barcode:', error);

        // Still set the barcode so user can proceed
        setNewProduct(prev => ({...prev, barcode: barcode}));

        // Show error message
        setFormError(
          `Could not search for product: ${error.message || 'Unknown error'}. ` +
          `Barcode captured, please enter details manually.`
        );
        setTimeout(() => setFormError(''), 5000);
      }
    }

    // Always close scanner at the end
    setIsAddProductScannerOpen(false);
  };

  const handleAdjustBarcodeScan = async (barcode: string) => {
    if (!token) return;

    try {
      // Search for product by barcode
      const product = await api.searchProductByBarcode(token, barcode);

      // Auto-populate the adjust form with found product
      setAdjustFormData(prev => ({
        ...prev,
        product_id: product.id
      }));

      // Update search field to show product name
      setAdjustProductSearch(product.name);

      // Close dropdown
      setIsAdjustProductDropdownOpen(false);

      // Show success message
      setStockSuccess(`Product "${product.name}" (${product.sku}) found!`);
      setTimeout(() => setStockSuccess(''), 3000);
    } catch (error: any) {
      // Product not found - guide user to add it
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        setStockError(
          `Product with barcode "${barcode}" not found. ` +
          `Use "Add" button to create it first.`
        );
      } else {
        setStockError(`Error scanning barcode: ${error.message || 'Unknown error'}`);
      }
      setTimeout(() => setStockError(''), 6000);
    }

    // Close scanner
    setIsAdjustScannerOpen(false);
  };

  const handleViewLocations = async (product: Product) => {
    setLocationProduct(product);
    setIsLocationModalOpen(true);
    setLocationStockLoading(true);
    
    try {
      if (!token) return;
      
      const stockData: any[] = [];
      
      // Fetch all branches first to determine parent organization
      const branches = await api.getBranches(token);
      
      // Get parent org ID (the organization that owns all branches)
      const parentOrgId = organization?.id || tenant?.id;
      
      // Fetch stock for parent organization (main location)
      if (parentOrgId && typeof parentOrgId === 'number') {
        try {
          // Use /branches/{id}/stock endpoint for consistent data fetching
          // This endpoint properly handles main location stock
          const mainLocationStock = await api.getBranchStockDirect(token, parentOrgId);
          const productAtMain = mainLocationStock.find((p: Product) => p.id === product.id);
          stockData.push({
            branch_name: organization?.name || tenant?.name || 'Main Location',
            branch_id: parentOrgId,
            quantity: productAtMain?.quantity || 0,
            unit: product.unit,
            isMain: true
          });
        } catch (error) {
          console.error('Failed to fetch main location stock:', error);
        }
      }
      
      // Get stock for each branch (excluding parent org if it's in the branches list)
      const branchStockData = await Promise.all(
        branches
          .filter((branch: any) => branch.id !== parentOrgId) // Don't duplicate parent org
          .map(async (branch: any) => {
            try {
              // Use /branches/{id}/stock endpoint for consistent data
              const branchProducts = await api.getBranchStockDirect(token, branch.id);
              const productInBranch = branchProducts.find((p: Product) => p.id === product.id);
              return {
                branch_name: branch.name,
                branch_id: branch.id,
                quantity: productInBranch?.quantity || 0,
                unit: product.unit,
                isMain: false
              };
            } catch (error) {
              console.error(`Failed to fetch stock for branch ${branch.name}:`, error);
              return {
                branch_name: branch.name,
                branch_id: branch.id,
                quantity: 0,
                unit: product.unit,
                isMain: false
              };
            }
          })
      );
      
      stockData.push(...branchStockData);
      
      setLocationStockData(stockData);
    } catch (error) {
      console.error('Failed to fetch location stock:', error);
      setLocationStockData([]);
    } finally {
      setLocationStockLoading(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">Inventory</h1>
            <p className="text-sm md:text-base text-gray-600 mt-1">Manage your products and stock levels</p>
            {isBranchTenant && organization && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <Package className="h-3 w-3" />
                Products from {organization.name} catalog • Branch-specific stock
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                setIsAddModalOpen(true);
                setFormError('');
                setFormSuccess('');
              }}
              className="flex-1 sm:flex-initial"
              disabled={!isEditable}
            >
              <Plus className="mr-2 h-4 w-4" /> Add
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsAdjustModalOpen(true);
                setStockError('');
                setStockSuccess('');
                setAdjustProductSearch('');
                setAdjustFormData({
                  product_id: 0,
                  adjustment_type: 'add',
                  quantity: 0,
                  reason: ''
                });
              }}
              className="flex-1 sm:flex-initial"
              disabled={!isEditable}
            >
              <SlidersHorizontal className="mr-2 h-4 w-4" /> Adjust
            </Button>
            <Button
              variant="outline"
              onClick={() => handleOpenHistory()}
              className="flex-1 sm:flex-initial"
            >
              <History className="mr-2 h-4 w-4" /> History
            </Button>
          </div>
        </div>

        {/* Branch Selector - Only for admins and parent org admins */}
        {(isAdmin || isParentOrgAdmin) && (
          <BranchSelector
            selectedBranchId={selectedBranchId}
            onBranchChange={setSelectedBranchId}
          />
        )}

        {/* Read-only notice - never show for parent org admins */}
        {!isEditable && !isParentOrgAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm text-amber-800">
              <AlertCircle className="inline w-4 h-4 mr-2" />
              You are viewing another branch's inventory in read-only mode. Switch to your assigned branch to make changes.
            </p>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name or SKU..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Desktop Table View */}
      <Card className="hidden lg:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold text-gray-700">
                    SKU
                    <div className="text-xs font-normal text-gray-500">Stock Keeping Unit</div>
                  </th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-700">Product</th>
                  <th className="px-6 py-4 text-left font-semibold text-gray-700">Category</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-700">Base Cost</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-700">Selling Price</th>
                  <th className="px-6 py-4 text-right font-semibold text-gray-700">Stock</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-center font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono text-gray-900">{product.sku}</span>
                      {/* NEW: Service badge */}
                      {product.is_service && (
                        <Badge variant="info" className="ml-2">Service</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <ProductImage
                          imageUrl={product.image_url}
                          productName={product.name}
                          size="thumb"
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{product.name}</span>
                            {isBranchTenant && (
                              <Badge variant="secondary" className="text-xs">Org</Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-600">{product.unit}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{product.category_rel?.name || 'Uncategorized'}</td>
                    <td className="px-6 py-4 text-right text-gray-900">
                      {product.base_cost !== null ? formatCurrency(product.base_cost) : (
                        <Badge variant="warning" className="text-xs">No Cost</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">
                      {product.selling_price !== null ? formatCurrency(product.selling_price) : (
                        <Badge variant="warning" className="text-xs">No Price</Badge>
                      )}
                    </td>
                    {/* CHANGED: Conditionally render stock column */}
                    <td className="px-6 py-4 text-right">
                      {product.is_service ? (
                        <Badge variant="info">N/A</Badge>
                      ) : (
                        <Badge variant={product.quantity <= product.reorder_level ? 'danger' : 'success'}>
                          {product.quantity} {product.unit}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={product.is_available ? 'success' : 'secondary'}>
                        {product.is_available ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    {/* CHANGED: Hide receive button for services */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPriceHistoryProduct(product);
                            setIsPriceHistoryModalOpen(true);
                          }}
                          className="text-purple-600 hover:text-purple-900"
                          title="View price history"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {!product.is_service && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewLocations(product)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View stock details"
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditClick(product)}
                          className="text-gray-600 hover:text-primary-600"
                          title="Edit product"
                          disabled={!isEditable}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="w-12 h-12 text-gray-300" />
                        <p>No products found</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View */}
      <div className="lg:hidden space-y-4">
        {filteredProducts.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <ProductImage
                  imageUrl={product.image_url}
                  productName={product.name}
                  size="thumb"
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
                <div className="flex-1 flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 text-base">{product.name}</h3>
                      {isBranchTenant && (
                        <Badge variant="secondary" className="text-xs">Org</Badge>
                      )}
                      {/* NEW: Service badge */}
                      {product.is_service && (
                        <Badge variant="info" className="text-xs">Service</Badge>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      <div>
                        <span className="text-xs text-gray-500">SKU: </span>
                        <span className="text-sm text-gray-900 font-mono">{product.sku}</span>
                      </div>
                      {product.barcode && (
                        <div className="flex items-center gap-1">
                          <ScanLine className="h-3 w-3 text-gray-400" />
                          <span className="text-sm text-gray-900 font-mono">{product.barcode}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={product.is_available ? 'success' : 'secondary'}>
                    {product.is_available ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <p className="text-gray-600">Category</p>
                  <p className="font-medium text-gray-900">{product.category_rel?.name || 'Uncategorized'}</p>
                </div>
                {/* CHANGED: Conditionally hide stock for services */}
                {!product.is_service && (
                  <div>
                    <p className="text-gray-600">Stock</p>
                    <Badge variant={product.quantity <= product.reorder_level ? 'danger' : 'success'}>
                      {product.quantity} {product.unit}
                    </Badge>
                  </div>
                )}
                <div>
                  <p className="text-gray-600">Base Cost</p>
                  <p className="font-medium text-gray-900">
                    {product.base_cost !== null ? formatCurrency(product.base_cost) : (
                      <Badge variant="warning" className="text-xs">No Cost</Badge>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Selling Price</p>
                  <p className="font-medium text-primary-600">
                    {product.selling_price !== null ? formatCurrency(product.selling_price) : (
                      <Badge variant="warning" className="text-xs">No Price</Badge>
                    )}
                  </p>
                </div>
              </div>

              {/* CHANGED: Hide receive button for services */}
              <div className="pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPriceHistoryProduct(product);
                    setIsPriceHistoryModalOpen(true);
                  }}
                  className="flex-1"
                >
                  <History className="h-4 w-4 mr-2" />
                  History
                </Button>
                {!product.is_service && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewLocations(product)}
                    className="flex-1"
                  >
                    <Info className="h-4 w-4 mr-2" />
                    Info
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEditClick(product)}
                  className="flex-1"
                  disabled={!isEditable}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredProducts.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>No products found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Add Product</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsAddModalOpen(false);
                  handleRemoveImage();
                }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleCreateProduct} className="p-6 space-y-6">
              {/* Error Message */}
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{formError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormError('')}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Success Message */}
              {formSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium text-sm">{formSuccess}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={newProduct.name}
                    onChange={e => {
                      setNewProduct({...newProduct, name: e.target.value});
                    }}
                    placeholder="e.g., 'MacBook Pro 16-inch' or 'IT Consultation'"
                  />
                </div>

                {/* Barcode Field */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Manufacturer Barcode (Optional)
                  </label>
                  <div className="relative">
                    <Input
                      value={newProduct.barcode || ''}
                      onChange={e => setNewProduct({...newProduct, barcode: e.target.value})}
                      placeholder="EAN-13, UPC-A, or other barcode format"
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setIsAddProductScannerOpen(true)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors p-1.5"
                      title="Scan barcode"
                    >
                      <ScanLine className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Scan or enter the barcode from product packaging. Leave blank for products without barcodes.
                  </p>
                </div>

                {/* Service Checkbox */}
                <div className="md:col-span-2">
                  <div className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 bg-gray-50">
                    <input
                      type="checkbox"
                      id="is_service_create"
                      checked={newProduct.is_service}
                      onChange={(e) => setNewProduct({ ...newProduct, is_service: e.target.checked })}
                      className="h-4 w-4 mt-0.5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <label htmlFor="is_service_create" className="text-sm font-medium text-gray-900 cursor-pointer">
                        This is a service (no stock tracking)
                      </label>
                    </div>
                  </div>
                </div>

                {/* Unit Selector - Searchable (hidden for services) */}
                {!newProduct.is_service && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        required
                        placeholder="Search unit (e.g., kg, pcs, liters)..."
                        className={unitSearch || newProduct.unit ? "pl-10 pr-10" : "pl-10"}
                        value={unitSearch || newProduct.unit || ''}
                        onChange={(e) => {
                          setUnitSearch(e.target.value);
                          setIsUnitDropdownOpen(true);
                          if (newProduct.unit) {
                            setNewProduct({...newProduct, unit: ''});
                          }
                        }}
                        onFocus={() => setIsUnitDropdownOpen(true)}
                      />
                      {/* Clear button - only when unit is selected */}
                      {(unitSearch || newProduct.unit) && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewProduct({...newProduct, unit: ''});
                            setUnitSearch('');
                            setIsUnitDropdownOpen(true);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1.5"
                          title="Clear selection"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Dropdown Results */}
                    {isUnitDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setIsUnitDropdownOpen(false)}
                        />
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {units.filter(u =>
                            u.name.toLowerCase().includes((unitSearch || '').toLowerCase())
                          ).length === 0 ? (
                            <div className="p-3 text-sm text-gray-500 text-center">No units found</div>
                          ) : (
                            units.filter(u =>
                              u.name.toLowerCase().includes((unitSearch || '').toLowerCase())
                            ).map(unit => (
                              <div
                                key={unit.id}
                                onClick={() => {
                                  setNewProduct({...newProduct, unit: unit.name});
                                  setUnitSearch('');
                                  setIsUnitDropdownOpen(false);
                                }}
                                className={`p-3 cursor-pointer hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0 ${newProduct.unit === unit.name ? 'bg-primary-50 text-primary-700' : 'text-gray-900'}`}
                              >
                                <div className="font-medium">{unit.name}</div>
                              </div>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Search and select measurement unit (e.g., kg, pcs, liters)
                  </p>
                </div>
                )}

                {/* Initial Quantity Field (hidden for services) */}
                {!newProduct.is_service && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Initial Quantity (Optional)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={newProduct.initial_quantity || 0}
                    onChange={e => setNewProduct({...newProduct, initial_quantity: parseInt(e.target.value) || 0})}
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-500">
                    Leave at 0 to add stock later using "Adjust" button
                  </p>
                </div>
                )}

              </div>


              {/* Image Upload Field */}
              <div className="space-y-2" ref={imageUploadSectionRef}>
                <label className="block text-sm font-medium text-gray-700">
                  Product Image (Optional)
                </label>
                <div className="flex items-center gap-4">
                  {/* Image Preview */}
                  {imagePreview ? (
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-full object-cover rounded-lg border-2 border-gray-200"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-dashed border-gray-300">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  {/* File Input */}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="product-image-upload"
                    />

                    {/* Button Group: Choose Image OR Take Photo */}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('product-image-upload')?.click()}
                        className="flex-1"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Choose Image
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCameraCaptureOpen(true)}
                        className="flex-1"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Take Photo
                      </Button>
                    </div>

                    <p className="text-xs text-gray-500 mt-1">
                      JPG, PNG, or WebP. Max 5MB. Recommended: 800x800px or larger
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setFormError('');
                    setFormSuccess('');
                    handleRemoveImage();
                  }}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto sm:ml-auto"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Creating...</span>
                    </div>
                  ) : (
                    'Create Product'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Edit Product</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingProduct(null);
                  handleRemoveImage();
                }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleUpdateProduct} className="p-6 space-y-6">
              {/* Error Message */}
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{formError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormError('')}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Success Message */}
              {formSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium text-sm">{formSuccess}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={newProduct.name}
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    placeholder="Enter product name"
                  />
                </div>

                {/* Barcode Field */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Manufacturer Barcode (Optional)
                  </label>
                  <Input
                    value={newProduct.barcode || ''}
                    onChange={e => setNewProduct({...newProduct, barcode: e.target.value})}
                    placeholder="EAN-13, UPC-A, or other barcode format"
                  />
                  <p className="text-xs text-gray-500">
                    Manufacturer barcode for scanning. Leave blank for products without barcodes.
                  </p>
                </div>

                {/* Service Checkbox */}
                <div className="md:col-span-2">
                  <div className={`flex items-start gap-3 p-4 rounded-lg border ${
                    editingProduct.is_service !== newProduct.is_service
                      ? 'border-orange-200 bg-orange-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}>
                    <input
                      type="checkbox"
                      id="is_service_edit"
                      checked={newProduct.is_service}
                      onChange={(e) => setNewProduct({ ...newProduct, is_service: e.target.checked })}
                      className="h-4 w-4 mt-0.5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <label htmlFor="is_service_edit" className="text-sm font-medium text-gray-900 cursor-pointer">
                        This is a service (no stock tracking)
                      </label>
                      {editingProduct.is_service !== newProduct.is_service && (
                        <p className="text-xs text-orange-700 mt-2 font-medium">
                          ⚠️ Changing service status will affect stock management for this product.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Category and Unit are hidden in edit mode - set by AI during creation */}

                {/* Units and Pricing Section */}
                <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Units and Pricing</h3>
                    <div className="flex items-center gap-2">
                      {/* Profit Margin - inline with header */}
                      {isAdmin && newProduct.base_cost && newProduct.selling_price && (
                        <div className="px-3 py-1.5 bg-blue-100 rounded-lg border border-blue-200">
                          <p className="text-xs text-blue-800 font-medium">
                            Margin: {(((parseFloat(newProduct.selling_price as any) - parseFloat(newProduct.base_cost as any)) / parseFloat(newProduct.selling_price as any)) * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPriceHistoryProduct(editingProduct);
                          setIsPriceHistoryModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        <History className="h-3 w-3 mr-1" />
                        View History
                      </Button>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className={`grid grid-cols-1 ${newProduct.is_service ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4`}>
                      {/* Unit Selector - Searchable (hidden for services) */}
                      {!newProduct.is_service && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Unit <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                              required
                              placeholder="Search unit..."
                              className={editUnitSearch || newProduct.unit ? "pl-10 pr-10" : "pl-10"}
                              value={editUnitSearch || newProduct.unit || ''}
                              onChange={(e) => {
                                setEditUnitSearch(e.target.value);
                                setIsEditUnitDropdownOpen(true);
                                if (newProduct.unit) {
                                  setNewProduct({...newProduct, unit: ''});
                                }
                              }}
                              onFocus={() => setIsEditUnitDropdownOpen(true)}
                            />
                            {/* Clear button */}
                            {(editUnitSearch || newProduct.unit) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewProduct({...newProduct, unit: ''});
                                  setEditUnitSearch('');
                                  setIsEditUnitDropdownOpen(true);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1.5"
                                title="Clear selection"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {/* Dropdown Results */}
                          {isEditUnitDropdownOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setIsEditUnitDropdownOpen(false)}
                              />
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                {units.filter(u =>
                                  u.name.toLowerCase().includes((editUnitSearch || '').toLowerCase())
                                ).length === 0 ? (
                                  <div className="p-3 text-sm text-gray-500 text-center">No units found</div>
                                ) : (
                                  units.filter(u =>
                                    u.name.toLowerCase().includes((editUnitSearch || '').toLowerCase())
                                  ).map(unit => (
                                    <div
                                      key={unit.id}
                                      onClick={() => {
                                        setNewProduct({...newProduct, unit: unit.name});
                                        setEditUnitSearch('');
                                        setIsEditUnitDropdownOpen(false);
                                      }}
                                      className={`p-3 cursor-pointer hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0 ${newProduct.unit === unit.name ? 'bg-primary-50 text-primary-700' : 'text-gray-900'}`}
                                    >
                                      <div className="font-medium">{unit.name}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        {editingProduct.unit && (
                          <p className="text-xs text-gray-500">
                            Current: {editingProduct.unit}
                          </p>
                        )}
                      </div>
                      )}

                      {/* Base Cost */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Base Cost (KES)
                        </label>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={newProduct.base_cost || ''}
                          onChange={e => setNewProduct({...newProduct, base_cost: e.target.value as any})}
                          placeholder="e.g., 5000.00"
                        />
                        {editingProduct.base_cost !== null && (
                          <p className="text-xs text-gray-500">
                            Current: {formatCurrency(editingProduct.base_cost)}
                          </p>
                        )}
                      </div>

                      {/* Selling Price */}
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Selling Price (KES)
                        </label>
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={newProduct.selling_price || ''}
                          onChange={e => setNewProduct({...newProduct, selling_price: e.target.value as any})}
                          placeholder="e.g., 7500.00"
                        />
                        {editingProduct.selling_price !== null && (
                          <p className="text-xs text-gray-500">
                            Current: {formatCurrency(editingProduct.selling_price)}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded bg-amber-50 border border-amber-200">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">Price settings are managed by administration.</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Current Quantity removed - use Stock Management instead */}
                {/* Reorder level removed - auto-calculated by system */}
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <Input
                  value={newProduct.description || ''}
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                  placeholder="Optional product description"
                />
              </div>

              {/* Image Upload/Update Field */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Product Image
                </label>
                <div className="flex items-center gap-4">
                  {/* Image Preview */}
                  {imagePreview || editingProduct.image_url ? (
                    <div className="relative w-24 h-24 flex-shrink-0">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover rounded-lg border-2 border-gray-200"
                        />
                      ) : (
                        <ProductImage
                          imageUrl={editingProduct.image_url}
                          productName={editingProduct.name}
                          size="thumb"
                          className="w-full h-full object-cover rounded-lg border-2 border-gray-200"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 border-2 border-dashed border-gray-300">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  {/* File Input */}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="product-image-edit"
                    />

                    {/* Button Group: Choose Image OR Take Photo */}
                    <div className="flex gap-2 mb-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('product-image-edit')?.click()}
                        className="flex-1"
                      >
                        <Package className="w-4 h-4 mr-2" />
                        {editingProduct.image_url || imagePreview ? 'Change Image' : 'Choose Image'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCameraCaptureOpen(true)}
                        className="flex-1"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        Take Photo
                      </Button>
                    </div>

                    {/* Delete Image Button */}
                    {(editingProduct.image_url || imagePreview) && (
                      <div className="mb-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!token || !editingProduct.id) return;
                            try {
                              setUploadingImage(true);
                              await api.deleteProductImage(token, editingProduct.id);
                              await handleRefreshProducts();
                              setEditingProduct({...editingProduct, image_url: ''});
                              handleRemoveImage();
                            } catch (error) {
                              console.error('Failed to delete image:', error);
                              setFormError('Failed to delete image. Please try again.');
                            } finally {
                              setUploadingImage(false);
                            }
                          }}
                          disabled={uploadingImage}
                          className="text-red-600 hover:text-red-700 w-full"
                        >
                          Delete Image
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      JPG, PNG, or WebP. Max 5MB. Recommended: 800x800px or larger
                    </p>
                    {imageFile && (
                      <p className="text-xs text-blue-600 mt-1">
                        New image selected. Will be uploaded when you save.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Product availability removed - products are available by default */}

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingProduct(null);
                    setFormError('');
                    setFormSuccess('');
                    handleRemoveImage();
                  }}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto sm:ml-auto"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Updating...</span>
                    </div>
                  ) : (
                    'Update Product'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Stock History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Stock History</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsHistoryModalOpen(false);
                  setStockError('');
                }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-6 space-y-4">
              {/* Filter by Product */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Filter by Product</label>
                <select
                  value={historyProductFilter || 0}
                  onChange={e => {
                    const productId = parseInt(e.target.value) || null;
                    setHistoryProductFilter(productId);
                    fetchStockHistory(productId || undefined);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value={0}>All Products</option>
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.name} (SKU: {product.sku})
                    </option>
                  ))}
                </select>
              </div>

              {/* Hint for corrections */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <div className="flex items-start gap-2 text-amber-800">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs">
                    <span className="font-medium">Need to correct an entry?</span> Close this dialog and use the "Adjust" button to add or remove stock with a documented reason for audit purposes.
                  </p>
                </div>
              </div>

              {/* History Table */}
              {historyLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="mt-2 text-gray-600">Loading history...</p>
                </div>
              ) : stockHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No stock movements found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Product</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Quantity</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Previous</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">New</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {stockHistory.map((movement) => {
                        const parsedNotes = parseStockNotes(movement.notes || '');
                        return (
                          <tr key={movement.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-700">
                              {new Date(movement.created_at).toLocaleDateString()} {new Date(movement.created_at).toLocaleTimeString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{movement.product?.name}</div>
                              <div className="text-xs text-gray-500">SKU: {movement.product?.sku}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={
                                movement.movement_type === 'in' ? 'success' :
                                movement.movement_type === 'out' ? 'danger' : 'warning'
                              }>
                                {movement.movement_type === 'in' ? 'Received' :
                                 movement.movement_type === 'out' ? 'Sold' : 'Adjusted'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              <span className={movement.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                                {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">{movement.previous_stock}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">{movement.new_stock}</td>
                            <td className="px-4 py-3 text-gray-700">
                              {parsedNotes ? (
                                <div className="space-y-1">
                                  {Object.entries(parsedNotes).map(([key, value]) => (
                                    <div key={key} className="text-xs">
                                      <span className="font-medium">{key}:</span> {value}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs">{movement.notes}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Location Distribution Modal */}
      {isLocationModalOpen && locationProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Stock by Location</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsLocationModalOpen(false);
                  setLocationProduct(null);
                }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-6 space-y-6">
              {/* Product Header */}
              <div className="flex items-center gap-4 pb-4 border-b">
                <ProductImage
                  imageUrl={locationProduct.image_url}
                  productName={locationProduct.name}
                  size="thumb"
                  className="w-20 h-20 rounded-lg object-cover"
                />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">{locationProduct.name}</h3>
                  <p className="text-sm text-gray-600">SKU: {locationProduct.sku}</p>
                  <div className="flex gap-4 mt-2 text-sm">
                    <div>
                      <span className="text-gray-600">Base Cost: </span>
                      <span className="font-medium">{locationProduct.base_cost !== null ? formatCurrency(locationProduct.base_cost) : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Selling Price: </span>
                      <span className="font-medium text-primary-600">{locationProduct.selling_price !== null ? formatCurrency(locationProduct.selling_price) : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stock Distribution Table */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Stock Distribution by Location</h4>
                {locationStockLoading ? (
                  <div className="bg-gray-50 rounded-lg p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-2"></div>
                    <p className="text-sm text-gray-600">Loading stock data...</p>
                  </div>
                ) : locationStockData.length > 0 ? (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    {locationStockData.map((location: any, index: number) => (
                      <div key={index} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-500" />
                          <span className="font-medium text-gray-900">{location.branch_name}</span>
                        </div>
                        <Badge variant={location.quantity > 0 ? 'success' : 'danger'}>
                          {location.quantity} {location.unit}
                        </Badge>
                      </div>
                    ))}
                    <div className="pt-3 mt-3 border-t border-gray-300">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">Total Across All Locations</span>
                        <Badge variant="info" className="text-base">
                          {locationStockData.reduce((sum: number, loc: any) => sum + loc.quantity, 0)} {locationProduct.unit}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-8 text-center">
                    <Info className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No location data available</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2 text-blue-800">
                  <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium">Stock Visibility</p>
                    <p className="mt-1">You can see stock across all locations. This helps you advise customers about product availability at any branch.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={() => {
                    setIsLocationModalOpen(false);
                    setLocationProduct(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Stock Adjustment</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsAdjustModalOpen(false);
                  setStockError('');
                  setStockSuccess('');
                  setAdjustProductSearch('');
                }}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleStockAdjustment} className="p-6 space-y-6">
              {/* Error Message */}
              {stockError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{stockError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStockError('')}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Success Message */}
              {stockSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium text-sm">{stockSuccess}</p>
                </div>
              )}

              {/* Product Selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Product <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search product by name or SKU..."
                      className={adjustProductSearch ? "pl-10 pr-20" : "pl-10 pr-12"}
                      value={adjustProductSearch}
                      onChange={(e) => {
                        setAdjustProductSearch(e.target.value);
                        setIsAdjustProductDropdownOpen(true);
                        if (adjustFormData.product_id !== 0) {
                          setAdjustFormData({...adjustFormData, product_id: 0});
                        }
                      }}
                      onFocus={() => setIsAdjustProductDropdownOpen(true)}
                    />

                    {/* Scan button - always visible */}
                    <button
                      type="button"
                      onClick={() => setIsAdjustScannerOpen(true)}
                      className={`absolute ${adjustProductSearch ? 'right-10' : 'right-3'} top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary-600 transition-colors p-1.5`}
                      title="Scan barcode"
                    >
                      <ScanLine className="h-4 w-4" />
                    </button>

                    {/* Clear button - only when search text exists */}
                    {adjustProductSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustFormData({...adjustFormData, product_id: 0});
                          setAdjustProductSearch('');
                          setIsAdjustProductDropdownOpen(true);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1.5"
                        title="Clear search"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Dropdown Results */}
                  {isAdjustProductDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsAdjustProductDropdownOpen(false)}
                      />
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {products.filter(p =>
                          !p.is_service &&
                          (p.name.toLowerCase().includes(adjustProductSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(adjustProductSearch.toLowerCase()))
                        ).length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 text-center">No products found</div>
                        ) : (
                          products.filter(p =>
                            !p.is_service &&
                            (p.name.toLowerCase().includes(adjustProductSearch.toLowerCase()) ||
                            p.sku.toLowerCase().includes(adjustProductSearch.toLowerCase()))
                          ).map(product => (
                            <div
                              key={product.id}
                              onClick={() => {
                                setAdjustFormData({...adjustFormData, product_id: product.id});
                                setAdjustProductSearch(product.name);
                                setIsAdjustProductDropdownOpen(false);
                              }}
                              className={`p-3 cursor-pointer hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0 ${adjustFormData.product_id === product.id ? 'bg-primary-50 text-primary-700' : 'text-gray-900'}`}
                            >
                              <div className="font-medium">{product.name}</div>
                              <div className="flex justify-between mt-1 text-xs text-gray-500">
                                <span>SKU: {product.sku}</span>
                                <span>Stock: {product.quantity} {product.unit}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Adjustment Type */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Adjustment Type <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="add"
                      checked={adjustFormData.adjustment_type === 'add'}
                      onChange={e => setAdjustFormData({...adjustFormData, adjustment_type: e.target.value as 'add' | 'remove'})}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="text-sm">Add Stock</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="remove"
                      checked={adjustFormData.adjustment_type === 'remove'}
                      onChange={e => setAdjustFormData({...adjustFormData, adjustment_type: e.target.value as 'add' | 'remove'})}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="text-sm">Remove Stock</span>
                  </label>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  required
                  min="1"
                  value={adjustFormData.quantity}
                  onChange={e => setAdjustFormData({...adjustFormData, quantity: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Reason <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  value={adjustFormData.reason}
                  onChange={e => setAdjustFormData({...adjustFormData, reason: e.target.value})}
                  placeholder="e.g., Physical count correction, Damaged items, Found stock"
                />
                <p className="text-xs text-gray-500">Provide a clear reason for audit purposes</p>
              </div>

              {/* Form Actions */}
              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAdjustModalOpen(false);
                    setStockError('');
                    setStockSuccess('');
                    setAdjustProductSearch('');
                  }}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto sm:ml-auto"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Adjusting...</span>
                    </div>
                  ) : (
                    'Adjust'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Price History Modal */}
      {priceHistoryProduct && (
        <PriceHistoryModal
          isOpen={isPriceHistoryModalOpen}
          onClose={() => {
            setIsPriceHistoryModalOpen(false);
            setPriceHistoryProduct(null);
          }}
          product={priceHistoryProduct}
          token={token!}
        />
      )}

      {/* Add Product Barcode Scanner */}
      <BarcodeScanner
        isOpen={isAddProductScannerOpen}
        onClose={() => setIsAddProductScannerOpen(false)}
        onScan={handleAddProductBarcodeScanned}
      />

      {/* Adjust Stock Barcode Scanner */}
      <BarcodeScanner
        isOpen={isAdjustScannerOpen}
        onClose={() => setIsAdjustScannerOpen(false)}
        onScan={handleAdjustBarcodeScan}
      />

      {/* Camera Capture Modal */}
      <CameraCapture
        isOpen={isCameraCaptureOpen}
        onClose={() => setIsCameraCaptureOpen(false)}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}
