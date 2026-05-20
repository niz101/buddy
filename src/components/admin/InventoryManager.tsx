import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package, Plus, Pencil, Trash2, Search, CreditCard,
  AlertTriangle, RefreshCw, X, Save, Tag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/shop';
import { toast } from '@/hooks/use-toast';

interface InventoryManagerProps {
  products: Product[];
  onRefresh: () => void;
}

const CATEGORIES = ['Dairy', 'Bakery', 'Grains', 'Beverages', 'Snacks', 'Hygiene', 'Household', 'Other'];

const emptyProduct = {
  name: '',
  name_swahili: '',
  price: 0,
  stock_quantity: 0,
  min_stock_threshold: 5,
  category: 'Other',
  card_code: '',
  shelf_location: '',
  description: '',
  image_url: '',
  is_active: true,
};

export function InventoryManager({ products, onRefresh }: InventoryManagerProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const filtered = products.filter(p => {
    const matchesSearch = !search || 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.card_code?.toLowerCase().includes(search.toLowerCase()) ||
      p.name_swahili?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    const matchesStock = !showLowStock || p.stock_quantity <= (p.min_stock_threshold || 5);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const lowStockCount = products.filter(p => p.stock_quantity <= (p.min_stock_threshold || 5)).length;
  const outOfStockCount = products.filter(p => p.stock_quantity <= 0).length;

  const openCreate = () => {
    setEditingProduct({ ...emptyProduct });
    setIsCreating(true);
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct({ ...product });
    setIsCreating(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProduct || !editingProduct.name || !editingProduct.category) {
      toast({ title: 'Error', description: 'Name and category are required', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const payload = {
      name: editingProduct.name,
      name_swahili: editingProduct.name_swahili || null,
      price: editingProduct.price || 0,
      stock_quantity: editingProduct.stock_quantity || 0,
      min_stock_threshold: editingProduct.min_stock_threshold || 5,
      category: editingProduct.category,
      card_code: editingProduct.card_code || null,
      shelf_location: editingProduct.shelf_location || null,
      description: editingProduct.description || null,
      image_url: editingProduct.image_url || null,
      is_active: editingProduct.is_active ?? true,
    };

    if (isCreating) {
      const { error } = await supabase.from('products').insert(payload);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Success', description: `${payload.name} added to inventory` });
      }
    } else {
      const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id!);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Updated', description: `${payload.name} updated` });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    setEditingProduct(null);
    onRefresh();
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id);
    if (!error) {
      toast({ title: 'Removed', description: `${product.name} deactivated` });
      onRefresh();
    }
  };

  const handleRestockAll = async () => {
    const lowStock = products.filter(p => p.stock_quantity <= (p.min_stock_threshold || 5));
    for (const p of lowStock) {
      await supabase.from('products').update({ stock_quantity: 50 }).eq('id', p.id);
    }
    toast({ title: 'Restocked', description: `${lowStock.length} items restocked to 50 units` });
    onRefresh();
  };

  const updateField = (field: string, value: any) => {
    setEditingProduct(prev => prev ? { ...prev, [field]: value } : null);
  };

  // === New Image Upload Handler ===
  const handleFileUpload = async (productId: string, file: File) => {
    try {
      setUploading(productId);
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}-${Date.now()}.${fileExt}`;

      // Upload
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const publicUrl = data.publicUrl;

      // Update product
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', productId);
      toast({ title: 'Success', description: 'Image uploaded successfully' });
      onRefresh();
    } catch (err) {
      console.error(err);
      toast({ title: 'Upload failed', description: 'Could not upload image', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="glass border-primary/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-orbitron text-primary">{products.length}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`glass ${lowStockCount > 0 ? 'border-warning/50' : 'border-muted/20'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className={`w-8 h-8 ${lowStockCount > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
            <div>
              <p className={`text-2xl font-orbitron ${lowStockCount > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{lowStockCount}</p>
              <p className="text-xs text-muted-foreground">Low Stock</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`glass ${outOfStockCount > 0 ? 'border-destructive/50' : 'border-muted/20'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <Package className={`w-8 h-8 ${outOfStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            <div>
              <p className={`text-2xl font-orbitron ${outOfStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{outOfStockCount}</p>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, card code, or Swahili name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={showLowStock ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowLowStock(!showLowStock)}
        >
          <AlertTriangle className="w-4 h-4 mr-1" />
          Low Stock
        </Button>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
        {lowStockCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleRestockAll}>
            Restock All Low
          </Button>
        )}
        <Button size="sm" className="glow-primary" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          Add Product
        </Button>
      </div>

      {/* Products grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((product) => {
          const stockPercent = Math.min((product.stock_quantity / Math.max(product.min_stock_threshold * 3, 50)) * 100, 100);
          const isLowStock = product.stock_quantity <= (product.min_stock_threshold || 5);
          const isOutOfStock = product.stock_quantity <= 0;

          return (
            <motion.div
              key={product.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`bg-muted/50 rounded-lg p-4 border ${
                isOutOfStock ? 'border-destructive/60' : isLowStock ? 'border-warning/60' : 'border-border'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{product.name}</p>
                  {product.name_swahili && (
                    <p className="text-xs text-muted-foreground italic">{product.name_swahili}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                </div>
                <Badge variant="outline" className="ml-2 shrink-0">
                  KES {product.price}
                </Badge>
              </div>

              {/* Product Image */}
              {product.image_url && (
                <img src={product.image_url} alt={product.name} className="w-full h-32 object-cover mb-2 rounded" />
              )}

              {/* Card code */}
              {product.card_code ? (
                <div className="flex items-center gap-1.5 mb-2">
                  <CreditCard className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                    {product.card_code}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground italic">No card linked</span>
                </div>
              )}

              {/* Stock */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>Stock</span>
                  <span className={isOutOfStock ? 'text-destructive font-bold' : isLowStock ? 'text-warning font-bold' : ''}>
                    {product.stock_quantity} units
                  </span>
                </div>
                <Progress
                  value={stockPercent}
                  className={`h-2 ${isOutOfStock ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-warning' : ''}`}
                />
                {product.shelf_location && (
                  <p className="text-[10px] text-muted-foreground">
                    📍 Shelf: {product.shelf_location}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(product)}>
                  <Pencil className="w-3 h-3 mr-1" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(product)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
                <label className="cursor-pointer flex-1">
                  <input type="file" className="hidden" onChange={e => e.target.files?.[0] && handleFileUpload(product.id!, e.target.files[0])} />
                  <Button variant="outline" size="sm" className="w-full">
                    {uploading === product.id ? 'Uploading...' : 'Upload Image'}
                  </Button>
                </label>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-2" />
          <p>No products found</p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isCreating ? <Plus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
              {isCreating ? 'Add New Product' : 'Edit Product'}
            </DialogTitle>
          </DialogHeader>

          {editingProduct && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Product Name *</Label>
                  <Input value={editingProduct.name || ''} onChange={e => updateField('name', e.target.value)} placeholder="e.g. Fresh Milk 500ml" />
                </div>
                <div>
                  <Label>Swahili Name</Label>
                  <Input value={editingProduct.name_swahili || ''} onChange={e => updateField('name_swahili', e.target.value)} placeholder="e.g. Maziwa" />
                </div>
                <div>
                  <Label>Category *</Label>
                  <Select value={editingProduct.category || 'Other'} onValueChange={v => updateField('category', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Price (KES) *</Label>
                  <Input type="number" value={editingProduct.price || 0} onChange={e => updateField('price', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Stock Quantity</Label>
                  <Input type="number" value={editingProduct.stock_quantity || 0} onChange={e => updateField('stock_quantity', Number(e.target.value))} />
                </div>
                <div>
                  <Label>Min Stock Threshold</Label>
                  <Input type="number" value={editingProduct.min_stock_threshold || 5} onChange={e => updateField('min_stock_threshold', Number(e.target.value))} />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-primary" />
                    Card Code
                  </Label>
                  <Input value={editingProduct.card_code || ''} onChange={e => updateField('card_code', e.target.value.toUpperCase())} placeholder="e.g. MILK001" className="uppercase font-mono" />
                </div>
                <div>
                  <Label>Shelf Location</Label>
                  <Input value={editingProduct.shelf_location || ''} onChange={e => updateField('shelf_location', e.target.value.toUpperCase())} placeholder="e.g. A1" className="uppercase" />
                </div>
                <div className="col-span-2">
                  <Label>Description</Label>
                  <Input value={editingProduct.description || ''} onChange={e => updateField('description', e.target.value)} placeholder="Short description" />
                </div>
                <div className="col-span-2">
                  <Label>Image URL</Label>
                  <Input value={editingProduct.image_url || ''} onChange={e => updateField('image_url', e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button className="flex-1 glow-primary" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : isCreating ? 'Add Product' : 'Save Changes'}
                </Button>
                <DialogClose asChild>
                  <Button variant="outline">
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </DialogClose>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}




































// original and perfect just in pursuit of a picture 
// import { useState } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import {
//   Package, Plus, Pencil, Trash2, Search, CreditCard,
//   AlertTriangle, RefreshCw, X, Save, Tag
// } from 'lucide-react';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { Badge } from '@/components/ui/badge';
// import { Progress } from '@/components/ui/progress';
// import {
//   Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose
// } from '@/components/ui/dialog';
// import {
//   Select, SelectContent, SelectItem, SelectTrigger, SelectValue
// } from '@/components/ui/select';
// import { Label } from '@/components/ui/label';
// import { supabase } from '@/integrations/supabase/client';
// import { Product } from '@/types/shop';
// import { toast } from '@/hooks/use-toast';

// interface InventoryManagerProps {
//   products: Product[];
//   onRefresh: () => void;
// }

// const CATEGORIES = ['Dairy', 'Bakery', 'Grains', 'Beverages', 'Snacks', 'Hygiene', 'Household', 'Other'];

// const emptyProduct = {
//   name: '',
//   name_swahili: '',
//   price: 0,
//   stock_quantity: 0,
//   min_stock_threshold: 5,
//   category: 'Other',
//   card_code: '',
//   shelf_location: '',
//   description: '',
//   image_url: '',
//   is_active: true,
// };

// export function InventoryManager({ products, onRefresh }: InventoryManagerProps) {
//   const [search, setSearch] = useState('');
//   const [filterCategory, setFilterCategory] = useState<string>('all');
//   const [showLowStock, setShowLowStock] = useState(false);
//   const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
//   const [isCreating, setIsCreating] = useState(false);
//   const [saving, setSaving] = useState(false);
//   const [dialogOpen, setDialogOpen] = useState(false);

//   const filtered = products.filter(p => {
//     const matchesSearch = !search || 
//       p.name.toLowerCase().includes(search.toLowerCase()) ||
//       p.card_code?.toLowerCase().includes(search.toLowerCase()) ||
//       p.name_swahili?.toLowerCase().includes(search.toLowerCase());
//     const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
//     const matchesStock = !showLowStock || p.stock_quantity <= (p.min_stock_threshold || 5);
//     return matchesSearch && matchesCategory && matchesStock;
//   });

//   const lowStockCount = products.filter(p => p.stock_quantity <= (p.min_stock_threshold || 5)).length;
//   const outOfStockCount = products.filter(p => p.stock_quantity <= 0).length;

//   const openCreate = () => {
//     setEditingProduct({ ...emptyProduct });
//     setIsCreating(true);
//     setDialogOpen(true);
//   };

//   const openEdit = (product: Product) => {
//     setEditingProduct({ ...product });
//     setIsCreating(false);
//     setDialogOpen(true);
//   };

//   const handleSave = async () => {
//     if (!editingProduct || !editingProduct.name || !editingProduct.category) {
//       toast({ title: 'Error', description: 'Name and category are required', variant: 'destructive' });
//       return;
//     }
//     setSaving(true);

//     const payload = {
//       name: editingProduct.name,
//       name_swahili: editingProduct.name_swahili || null,
//       price: editingProduct.price || 0,
//       stock_quantity: editingProduct.stock_quantity || 0,
//       min_stock_threshold: editingProduct.min_stock_threshold || 5,
//       category: editingProduct.category,
//       card_code: editingProduct.card_code || null,
//       shelf_location: editingProduct.shelf_location || null,
//       description: editingProduct.description || null,
//       image_url: editingProduct.image_url || null,
//       is_active: editingProduct.is_active ?? true,
//     };

//     if (isCreating) {
//       const { error } = await supabase.from('products').insert(payload);
//       if (error) {
//         toast({ title: 'Error', description: error.message, variant: 'destructive' });
//       } else {
//         toast({ title: 'Success', description: `${payload.name} added to inventory` });
//       }
//     } else {
//       const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id!);
//       if (error) {
//         toast({ title: 'Error', description: error.message, variant: 'destructive' });
//       } else {
//         toast({ title: 'Updated', description: `${payload.name} updated` });
//       }
//     }

//     setSaving(false);
//     setDialogOpen(false);
//     setEditingProduct(null);
//     onRefresh();
//   };

//   const handleDelete = async (product: Product) => {
//     if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
//     const { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id);
//     if (!error) {
//       toast({ title: 'Removed', description: `${product.name} deactivated` });
//       onRefresh();
//     }
//   };

//   const handleRestockAll = async () => {
//     const lowStock = products.filter(p => p.stock_quantity <= (p.min_stock_threshold || 5));
//     for (const p of lowStock) {
//       await supabase.from('products').update({ stock_quantity: 50 }).eq('id', p.id);
//     }
//     toast({ title: 'Restocked', description: `${lowStock.length} items restocked to 50 units` });
//     onRefresh();
//   };

//   const updateField = (field: string, value: any) => {
//     setEditingProduct(prev => prev ? { ...prev, [field]: value } : null);
//   };

//   return (
//     <div className="space-y-4">
//       {/* Summary cards */}
//       <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
//         <Card className="glass border-primary/20">
//           <CardContent className="p-4 flex items-center gap-3">
//             <Package className="w-8 h-8 text-primary" />
//             <div>
//               <p className="text-2xl font-orbitron text-primary">{products.length}</p>
//               <p className="text-xs text-muted-foreground">Total Products</p>
//             </div>
//           </CardContent>
//         </Card>
//         <Card className={`glass ${lowStockCount > 0 ? 'border-warning/50' : 'border-muted/20'}`}>
//           <CardContent className="p-4 flex items-center gap-3">
//             <AlertTriangle className={`w-8 h-8 ${lowStockCount > 0 ? 'text-warning' : 'text-muted-foreground'}`} />
//             <div>
//               <p className={`text-2xl font-orbitron ${lowStockCount > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{lowStockCount}</p>
//               <p className="text-xs text-muted-foreground">Low Stock</p>
//             </div>
//           </CardContent>
//         </Card>
//         <Card className={`glass ${outOfStockCount > 0 ? 'border-destructive/50' : 'border-muted/20'}`}>
//           <CardContent className="p-4 flex items-center gap-3">
//             <Package className={`w-8 h-8 ${outOfStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
//             <div>
//               <p className={`text-2xl font-orbitron ${outOfStockCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{outOfStockCount}</p>
//               <p className="text-xs text-muted-foreground">Out of Stock</p>
//             </div>
//           </CardContent>
//         </Card>
//       </div>

//       {/* Toolbar */}
//       <div className="flex flex-wrap items-center gap-3">
//         <div className="relative flex-1 min-w-[200px]">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
//           <Input
//             placeholder="Search by name, card code, or Swahili name..."
//             value={search}
//             onChange={e => setSearch(e.target.value)}
//             className="pl-9"
//           />
//         </div>
//         <Select value={filterCategory} onValueChange={setFilterCategory}>
//           <SelectTrigger className="w-[140px]">
//             <SelectValue placeholder="Category" />
//           </SelectTrigger>
//           <SelectContent>
//             <SelectItem value="all">All Categories</SelectItem>
//             {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
//           </SelectContent>
//         </Select>
//         <Button
//           variant={showLowStock ? 'default' : 'outline'}
//           size="sm"
//           onClick={() => setShowLowStock(!showLowStock)}
//         >
//           <AlertTriangle className="w-4 h-4 mr-1" />
//           Low Stock
//         </Button>
//         <Button variant="outline" size="sm" onClick={onRefresh}>
//           <RefreshCw className="w-4 h-4 mr-1" />
//           Refresh
//         </Button>
//         {lowStockCount > 0 && (
//           <Button variant="outline" size="sm" onClick={handleRestockAll}>
//             Restock All Low
//           </Button>
//         )}
//         <Button size="sm" className="glow-primary" onClick={openCreate}>
//           <Plus className="w-4 h-4 mr-1" />
//           Add Product
//         </Button>
//       </div>

//       {/* Products grid */}
//       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
//         {filtered.map((product) => {
//           const stockPercent = Math.min((product.stock_quantity / Math.max(product.min_stock_threshold * 3, 50)) * 100, 100);
//           const isLowStock = product.stock_quantity <= (product.min_stock_threshold || 5);
//           const isOutOfStock = product.stock_quantity <= 0;

//           return (
//             <motion.div
//               key={product.id}
//               layout
//               initial={{ opacity: 0, scale: 0.95 }}
//               animate={{ opacity: 1, scale: 1 }}
//               className={`bg-muted/50 rounded-lg p-4 border ${
//                 isOutOfStock ? 'border-destructive/60' : isLowStock ? 'border-warning/60' : 'border-border'
//               }`}
//             >
//               <div className="flex justify-between items-start mb-3">
//                 <div className="flex-1 min-w-0">
//                   <p className="font-semibold truncate">{product.name}</p>
//                   {product.name_swahili && (
//                     <p className="text-xs text-muted-foreground italic">{product.name_swahili}</p>
//                   )}
//                   <p className="text-xs text-muted-foreground">{product.category}</p>
//                 </div>
//                 <Badge variant="outline" className="ml-2 shrink-0">
//                   KES {product.price}
//                 </Badge>
//               </div>

//               {/* Card code */}
//               {product.card_code ? (
//                 <div className="flex items-center gap-1.5 mb-2">
//                   <CreditCard className="w-3.5 h-3.5 text-primary" />
//                   <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
//                     {product.card_code}
//                   </span>
//                 </div>
//               ) : (
//                 <div className="flex items-center gap-1.5 mb-2">
//                   <Tag className="w-3.5 h-3.5 text-muted-foreground" />
//                   <span className="text-xs text-muted-foreground italic">No card linked</span>
//                 </div>
//               )}

//               {/* Stock */}
//               <div className="space-y-1.5">
//                 <div className="flex justify-between text-sm">
//                   <span>Stock</span>
//                   <span className={isOutOfStock ? 'text-destructive font-bold' : isLowStock ? 'text-warning font-bold' : ''}>
//                     {product.stock_quantity} units
//                   </span>
//                 </div>
//                 <Progress
//                   value={stockPercent}
//                   className={`h-2 ${isOutOfStock ? '[&>div]:bg-destructive' : isLowStock ? '[&>div]:bg-warning' : ''}`}
//                 />
//                 {product.shelf_location && (
//                   <p className="text-[10px] text-muted-foreground">
//                     📍 Shelf: {product.shelf_location}
//                   </p>
//                 )}
//               </div>

//               {/* Actions */}
//               <div className="flex gap-2 mt-3 pt-3 border-t border-border">
//                 <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(product)}>
//                   <Pencil className="w-3 h-3 mr-1" />
//                   Edit
//                 </Button>
//                 <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(product)}>
//                   <Trash2 className="w-3 h-3" />
//                 </Button>
//               </div>
//             </motion.div>
//           );
//         })}
//       </div>

//       {filtered.length === 0 && (
//         <div className="text-center py-12 text-muted-foreground">
//           <Package className="w-12 h-12 mx-auto mb-2" />
//           <p>No products found</p>
//         </div>
//       )}

//       {/* Create/Edit Dialog */}
//       <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
//         <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               {isCreating ? <Plus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
//               {isCreating ? 'Add New Product' : 'Edit Product'}
//             </DialogTitle>
//           </DialogHeader>

//           {editingProduct && (
//             <div className="space-y-4">
//               <div className="grid grid-cols-2 gap-3">
//                 <div className="col-span-2">
//                   <Label>Product Name *</Label>
//                   <Input value={editingProduct.name || ''} onChange={e => updateField('name', e.target.value)} placeholder="e.g. Fresh Milk 500ml" />
//                 </div>
//                 <div>
//                   <Label>Swahili Name</Label>
//                   <Input value={editingProduct.name_swahili || ''} onChange={e => updateField('name_swahili', e.target.value)} placeholder="e.g. Maziwa" />
//                 </div>
//                 <div>
//                   <Label>Category *</Label>
//                   <Select value={editingProduct.category || 'Other'} onValueChange={v => updateField('category', v)}>
//                     <SelectTrigger><SelectValue /></SelectTrigger>
//                     <SelectContent>
//                       {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
//                     </SelectContent>
//                   </Select>
//                 </div>
//                 <div>
//                   <Label>Price (KES) *</Label>
//                   <Input type="number" value={editingProduct.price || 0} onChange={e => updateField('price', Number(e.target.value))} />
//                 </div>
//                 <div>
//                   <Label>Stock Quantity</Label>
//                   <Input type="number" value={editingProduct.stock_quantity || 0} onChange={e => updateField('stock_quantity', Number(e.target.value))} />
//                 </div>
//                 <div>
//                   <Label>Min Stock Threshold</Label>
//                   <Input type="number" value={editingProduct.min_stock_threshold || 5} onChange={e => updateField('min_stock_threshold', Number(e.target.value))} />
//                 </div>
//                 <div>
//                   <Label className="flex items-center gap-1">
//                     <CreditCard className="w-3.5 h-3.5 text-primary" />
//                     Card Code
//                   </Label>
//                   <Input value={editingProduct.card_code || ''} onChange={e => updateField('card_code', e.target.value.toUpperCase())} placeholder="e.g. MILK001" className="uppercase font-mono" />
//                 </div>
//                 <div>
//                   <Label>Shelf Location</Label>
//                   <Input value={editingProduct.shelf_location || ''} onChange={e => updateField('shelf_location', e.target.value.toUpperCase())} placeholder="e.g. A1" className="uppercase" />
//                 </div>
//                 <div className="col-span-2">
//                   <Label>Description</Label>
//                   <Input value={editingProduct.description || ''} onChange={e => updateField('description', e.target.value)} placeholder="Short description" />
//                 </div>
//                 <div className="col-span-2">
//                   <Label>Image URL</Label>
//                   <Input value={editingProduct.image_url || ''} onChange={e => updateField('image_url', e.target.value)} placeholder="https://..." />
//                 </div>
//               </div>

//               <div className="flex gap-3 pt-2">
//                 <Button className="flex-1 glow-primary" onClick={handleSave} disabled={saving}>
//                   <Save className="w-4 h-4 mr-2" />
//                   {saving ? 'Saving...' : isCreating ? 'Add Product' : 'Save Changes'}
//                 </Button>
//                 <DialogClose asChild>
//                   <Button variant="outline">
//                     <X className="w-4 h-4 mr-1" />
//                     Cancel
//                   </Button>
//                 </DialogClose>
//               </div>
//             </div>
//           )}
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }