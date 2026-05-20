import { useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Scan, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Product } from '@/types/shop';

interface CardScannerProps {
  products: Product[];
  onCardScanned: (product: Product) => void;
}

export function CardScanner({ products, onCardScanned }: CardScannerProps) {
  const [cardCode, setCardCode] = useState('');
  const [lastScanned, setLastScanned] = useState<Product | null>(null);
  const [error, setError] = useState('');

  const handleScan = (code: string) => {
    const product = products.find(p => p.card_code?.toLowerCase() === code.toLowerCase());
    
    if (product) {
      setLastScanned(product);
      setError('');
      onCardScanned(product);
      setCardCode('');
      
      // Clear success message after 3 seconds
      setTimeout(() => setLastScanned(null), 3000);
    } else {
      setError('Product not found. Try again.');
      setLastScanned(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cardCode.trim()) {
      handleScan(cardCode.trim());
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass rounded-xl p-4 space-y-4"
    >
      <div className="flex items-center gap-2 text-accent">
        <CreditCard className="w-5 h-5" />
        <span className="font-semibold">Product Card Scanner</span>
      </div>

      <p className="text-sm text-muted-foreground">
        Pick a product card and enter its code, or scan the barcode
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Scan className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={cardCode}
            onChange={(e) => setCardCode(e.target.value.toUpperCase())}
            placeholder="Enter card code (e.g., MILK001)"
            className="pl-10 uppercase"
          />
        </div>
        <Button type="submit">Scan</Button>
      </form>

      {/* Success feedback */}
      {lastScanned && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-success/20 text-success p-3 rounded-lg"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Added: {lastScanned.name}</span>
        </motion.div>
      )}

      {/* Error feedback */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-destructive text-sm"
        >
          {error}
        </motion.div>
      )}

      {/* Available cards hint */}
      <div className="text-xs text-muted-foreground">
        <p className="mb-1">Sample cards: MILK001, BREAD001, SUGAR001, RICE001</p>
      </div>
    </motion.div>
  );
}
