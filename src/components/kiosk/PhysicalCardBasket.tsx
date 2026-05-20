import { motion } from 'framer-motion';
import { Package, Plus, Check, Tag } from 'lucide-react';
import { Product, CartItem } from '@/types/shop';

interface PhysicalCardBasketProps {
  products: Product[];
  cart: CartItem[];
  onSelectCard: (product: Product) => void;
}

export function PhysicalCardBasket({ products, cart, onSelectCard }: PhysicalCardBasketProps) {
  const getCartQuantity = (productId: string) => {
    return cart.find(item => item.product.id === productId)?.quantity || 0;
  };

  // Group products into rows for the physical card layout
  const rows = [];
  for (let i = 0; i < products.length; i += 6) {
    rows.push(products.slice(i, i + 6));
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h3 className="text-xl font-orbitron text-primary">🎴 Pick Product Cards</h3>
        <p className="text-sm text-muted-foreground">
          Tap on cards to add items to your order
        </p>
      </div>

      {/* Physical card display - mimics real cards in a basket */}
      <div className="bg-muted/30 rounded-2xl p-4 border-2 border-dashed border-border">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {products.map((product, index) => {
            const qty = getCartQuantity(product.id);
            const outOfStock = product.stock_quantity <= 0;

            return (
              <motion.button
                key={product.id}
                initial={{ opacity: 0, rotateY: -180 }}
                animate={{ opacity: 1, rotateY: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => !outOfStock && onSelectCard(product)}
                disabled={outOfStock}
                className={`
                  relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer
                  transition-all duration-200
                  ${outOfStock 
                    ? 'opacity-40 cursor-not-allowed grayscale' 
                    : 'hover:shadow-lg hover:shadow-primary/20'}
                  ${qty > 0 ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                `}
                style={{
                  background: `linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)`,
                  boxShadow: qty > 0 ? '0 0 20px hsl(var(--primary) / 0.3)' : undefined
                }}
              >
                {/* Card content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                  {/* Product icon/image placeholder */}
                  {/* <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-background/50 flex items-center justify-center mb-1">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-16 h-16 md:w-32 md:h-32 object-contain"
                      />
                    ) : (
                      <Package className="w-6 h-6 md:w-8 md:h-8 text-primary" />
                    )}
                  </div> */}

                  {/* Product icon/image placeholder */}
<div className="w-24 h-24 md:w-24 md:h-24 rounded-lg bg-background/50 flex items-center justify-center mb-1">
  {product.image_url ? (
    <img
      src={product.image_url}
      alt={product.name}
      className="w-50 h-50 object-contain"
    />
  ) : (
    <Package className="w-50 h-50 text-primary" />
  )}
</div>

                  
                  {/* Product name */}
                  <p className="text-[10px] md:text-xs font-bold text-foreground text-center leading-tight line-clamp-2">
                    {product.name}
                  </p>
                  
                  {/* Card code */}
                  {product.card_code && (
                    <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[8px] md:text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
                      {product.card_code}
                    </div>
                  )}
                  
                  {/* Price */}
                  <p className="text-[9px] md:text-xs text-primary font-orbitron mt-1">
                    KES {product.price}
                  </p>
                </div>

                {/* Quantity badge when in cart */}
                {qty > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg"
                  >
                    <span className="text-xs font-bold text-primary-foreground">{qty}</span>
                  </motion.div>
                )}

                {/* Add indicator */}
                {!outOfStock && qty === 0 && (
                  <div className="absolute inset-0 bg-primary/0 hover:bg-primary/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Plus className="w-8 h-8 text-primary" />
                  </div>
                )}

                {/* In cart indicator */}
                {qty > 0 && (
                  <div className="absolute bottom-1 right-1">
                    <Check className="w-4 h-4 text-success" />
                  </div>
                )}

                {/* Out of stock overlay */}
                {outOfStock && (
                  <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-destructive">OUT</span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary/20 border border-primary" />
          <span>Tap to add</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-2 h-2 text-primary-foreground" />
          </div>
          <span>In cart</span>
        </div>
      </div>
    </div>
  );
}




































// super just image pursuit 
// import { motion } from 'framer-motion';
// import { Package, Plus, Check } from 'lucide-react';
// import { Product, CartItem } from '@/types/shop';

// interface PhysicalCardBasketProps {
//   products: Product[];
//   cart: CartItem[];
//   onSelectCard: (product: Product) => void;
// }

// export function PhysicalCardBasket({ products, cart, onSelectCard }: PhysicalCardBasketProps) {
//   const getCartQuantity = (productId: string) => {
//     return cart.find(item => item.product.id === productId)?.quantity || 0;
//   };

//   // Group products into rows for the physical card layout
//   const rows = [];
//   for (let i = 0; i < products.length; i += 6) {
//     rows.push(products.slice(i, i + 6));
//   }

//   return (
//     <div className="space-y-4">
//       <div className="text-center mb-4">
//         <h3 className="text-xl font-orbitron text-primary">🎴 Pick Product Cards</h3>
//         <p className="text-sm text-muted-foreground">
//           Tap on cards to add items to your order
//         </p>
//       </div>

//       {/* Physical card display - mimics real cards in a basket */}
//       <div className="bg-muted/30 rounded-2xl p-4 border-2 border-dashed border-border">
//         <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
//           {products.map((product, index) => {
//             const qty = getCartQuantity(product.id);
//             const outOfStock = product.stock_quantity <= 0;
            
//             return (
//               <motion.button
//                 key={product.id}
//                 initial={{ opacity: 0, rotateY: -180 }}
//                 animate={{ opacity: 1, rotateY: 0 }}
//                 transition={{ delay: index * 0.05 }}
//                 whileHover={{ scale: 1.05, y: -5 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => !outOfStock && onSelectCard(product)}
//                 disabled={outOfStock}
//                 className={`
//                   relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer
//                   transition-all duration-200
//                   ${outOfStock 
//                     ? 'opacity-40 cursor-not-allowed grayscale' 
//                     : 'hover:shadow-lg hover:shadow-primary/20'}
//                   ${qty > 0 ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
//                 `}
//                 style={{
//                   background: `linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--muted)) 100%)`,
//                   boxShadow: qty > 0 ? '0 0 20px hsl(var(--primary) / 0.3)' : undefined
//                 }}
//               >
//                 {/* Card content */}
//                 <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
//                   {/* Product icon/image placeholder */}
//                   <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-background/50 flex items-center justify-center mb-1">
//                     <Package className="w-6 h-6 md:w-8 md:h-8 text-primary" />
//                   </div>
                  
//                   {/* Product name */}
//                   <p className="text-[10px] md:text-xs font-bold text-foreground text-center leading-tight line-clamp-2">
//                     {product.name}
//                   </p>
                  
//                   {/* Card code */}
//                   {product.card_code && (
//                     <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[8px] md:text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">
//                       {product.card_code}
//                     </div>
//                   )}
                  
//                   {/* Price */}
//                   <p className="text-[9px] md:text-xs text-primary font-orbitron mt-1">
//                     KES {product.price}
//                   </p>
//                 </div>

//                 {/* Quantity badge when in cart */}
//                 {qty > 0 && (
//                   <motion.div
//                     initial={{ scale: 0 }}
//                     animate={{ scale: 1 }}
//                     className="absolute -top-1 -right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow-lg"
//                   >
//                     <span className="text-xs font-bold text-primary-foreground">{qty}</span>
//                   </motion.div>
//                 )}

//                 {/* Add indicator */}
//                 {!outOfStock && qty === 0 && (
//                   <div className="absolute inset-0 bg-primary/0 hover:bg-primary/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
//                     <Plus className="w-8 h-8 text-primary" />
//                   </div>
//                 )}

//                 {/* In cart indicator */}
//                 {qty > 0 && (
//                   <div className="absolute bottom-1 right-1">
//                     <Check className="w-4 h-4 text-success" />
//                   </div>
//                 )}

//                 {/* Out of stock overlay */}
//                 {outOfStock && (
//                   <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
//                     <span className="text-[10px] font-bold text-destructive">OUT</span>
//                   </div>
//                 )}
//               </motion.button>
//             );
//           })}
//         </div>
//       </div>

//       {/* Legend */}
//       <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
//         <div className="flex items-center gap-1">
//           <div className="w-3 h-3 rounded-full bg-primary/20 border border-primary" />
//           <span>Tap to add</span>
//         </div>
//         <div className="flex items-center gap-1">
//           <div className="w-3 h-3 rounded-full bg-primary flex items-center justify-center">
//             <Check className="w-2 h-2 text-primary-foreground" />
//           </div>
//           <span>In cart</span>
//         </div>
//       </div>
//     </div>
//   );
// }
