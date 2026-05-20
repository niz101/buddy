import { motion } from 'framer-motion';
import { ShoppingCart, Trash2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CartItem } from '@/types/shop';

interface CartPanelProps {
  cart: CartItem[];
  total: number;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  language?: string;
}

export function CartPanel({ 
  cart, 
  total, 
  onUpdateQuantity, 
  onRemove, 
  onClear, 
  onCheckout,
  language = 'en'
}: CartPanelProps) {
  const getText = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      empty: { en: 'Your cart is empty', sw: 'Kikapu chako kiko tupu', fr: 'Votre panier est vide' },
      addHint: { en: 'Add items by tapping products, speaking, or picking cards', sw: 'Ongeza bidhaa kwa kubofya, kusema, au kuchagua kadi', fr: 'Ajoutez des articles en tapant, parlant ou choisissant des cartes' },
      cart: { en: 'Cart', sw: 'Kikapu', fr: 'Panier' },
      clear: { en: 'Clear', sw: 'Futa', fr: 'Vider' },
      total: { en: 'Total', sw: 'Jumla', fr: 'Total' },
      checkout: { en: 'START PACKING??', sw: 'LIPIA', fr: 'PAYER' }
    };
    return texts[key]?.[language] || texts[key]?.['en'] || key;
  };
  if (cart.length === 0) {
    return (
      <div className="glass rounded-xl p-6 h-full flex flex-col items-center justify-center text-center">
        <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="text-xl font-semibold text-muted-foreground">
          {getText('empty')}
        </h3>
        <p className="text-sm text-muted-foreground mt-2">
          {getText('addHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-orbitron text-primary flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          {getText('cart')} ({cart.length})
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onClear}
        >
          <Trash2 className="w-4 h-4 mr-1" />
          {getText('clear')}
        </Button>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-auto space-y-3">
        {cart.map((item, index) => (
          <motion.div
            key={item.product.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-muted/50 rounded-lg p-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.product.name}</p>
              <p className="text-sm text-muted-foreground">
                KES {item.product.price} × {item.quantity}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
              >
                -
              </Button>
              <span className="w-6 text-center font-bold">{item.quantity}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
              >
                +
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => onRemove(item.product.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Total and checkout */}
      <div className="mt-4 pt-4 border-t border-border space-y-4">
        <div className="flex justify-between items-center text-2xl font-orbitron">
          <span>{getText('total')}:</span>
          <span className="text-primary text-glow">
            KES {total.toLocaleString()}
          </span>
        </div>
        <Button
          className="w-full h-14 text-xl font-orbitron glow-primary"
          onClick={onCheckout}
        >
          <CreditCard className="w-6 h-6 mr-3" />
          {getText('checkout')}
        </Button>
      </div>
    </div>
  );
}
