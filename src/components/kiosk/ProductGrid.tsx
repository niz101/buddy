import { motion } from 'framer-motion';
import { Plus, Minus, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Product, CartItem } from '@/types/shop';


interface ProductGridProps {
  products: Product[];
  cart: CartItem[];
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
}

export function ProductGrid({ products, cart, onAddToCart, onUpdateQuantity }: ProductGridProps) {
  const getCartQuantity = (productId: string) => {
    return cart.find(item => item.product.id === productId)?.quantity || 0;
  };

  const categories = [...new Set(products.map(p => p.category))];

  return (
    <div className="space-y-8">
      {categories.map(category => (
        <div key={category}>
          <h2 className="text-2xl font-orbitron text-primary mb-4 capitalize">
            {category}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products
              .filter(p => p.category === category)
              .map((product, index) => {
                const qty = getCartQuantity(product.id);
                const outOfStock = product.stock_quantity <= 0;

                return (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className={`
                      glass rounded-xl p-4 relative overflow-hidden
                      ${outOfStock ? 'opacity-50' : 'hover:glow-accent'}
                      ${qty > 0 ? 'border-primary border-2 glow-primary' : ''}
                      transition-all duration-300
                    `}
                  >
                    {/* Stock badge */}
                    {product.stock_quantity <= 5 && product.stock_quantity > 0 && (
                      <div className="absolute top-2 right-2 bg-warning text-warning-foreground px-2 py-0.5 rounded text-xs font-bold">
                        Low Stock
                      </div>
                    )}

                    {/* Product image placeholder */}
                    <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center">
                      <Package className="w-12 h-12 text-muted-foreground" />
                    </div>

                    {/* Product info */}
                    <h3 className="font-semibold text-foreground truncate">
                      {product.name}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {product.name_swahili}
                    </p>
                    
                    {/* Price */}
                    <p className="text-xl font-orbitron text-primary mt-2">
                      KES {product.price.toLocaleString()}
                    </p>

                    {/* Card code for physical cards */}
                    {product.card_code && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Card: {product.card_code}
                      </p>
                    )}

                    {/* Add/Remove controls */}
                    <div className="mt-4">
                      {qty === 0 ? (
                        <Button
                          className="w-full"
                          disabled={outOfStock}
                          onClick={() => onAddToCart(product)}
                        >
                          {outOfStock ? 'Out of Stock' : 'Add to Cart'}
                        </Button>
                      ) : (
                        <div className="flex items-center justify-between bg-muted rounded-lg p-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onUpdateQuantity(product.id, qty - 1)}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="font-bold text-lg">{qty}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={qty >= product.stock_quantity}
                            onClick={() => onUpdateQuantity(product.id, qty + 1)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
