// nice 100% working 
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, Activity, Volume2 } from 'lucide-react';
import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
import { ProductGrid } from '@/components/kiosk/ProductGrid';
import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
import { CartPanel } from '@/components/kiosk/CartPanel';
import { VoiceInput } from '@/components/kiosk/VoiceInput';
import { TextInput } from '@/components/kiosk/TextInput';
import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
import { Order, Product } from '@/types/shop';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { speak, voiceMessages } from '@/lib/voiceGuidance';
import { hardwareBridge } from '@/lib/hardwarebridge';

type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

export default function CustomerKiosk() {
  const [stage, setStage] = useState<KioskStage>('greeting');
  const [language, setLanguage] = useState('en');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

  const { products } = useProducts();
  useShopStatus();
  const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
  const { session, startSession, endSession } = useSession();
  const { createOrder } = useOrders();
  const { task, progress, startPickAndPack } = useRobotSimulation();

  const packingSpokenRef = useRef(false);

  // ======== Hardware Bridge ========
  useEffect(() => {
    hardwareBridge.connect();
    return () => hardwareBridge.disconnect();
  }, []);

  // ======== Session / Customer Start ========
  const handleStart = async (selectedLanguage: string) => {
    setLanguage(selectedLanguage);
    const newSession = await startSession(selectedLanguage);
    if (newSession) setStage('shopping');
  };

  // ======== Find Product ========
  const findProductByText = useCallback((text: string): Product | null => {
    const lowerText = text.toLowerCase().trim();
    let match = products.find(p =>
      p.name.toLowerCase() === lowerText ||
      (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
      (p.card_code && p.card_code.toLowerCase() === lowerText)
    );
    if (!match) {
      match = products.find(p =>
        p.name.toLowerCase().includes(lowerText) ||
        lowerText.includes(p.name.toLowerCase()) ||
        (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
      );
    }
    return match || null;
  }, [products]);

  // ======== Handle Voice/Text Input ========
  const handleTextOrVoiceInput = useCallback((text: string) => {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
      if (itemCount > 0) handleCheckout();
      return;
    }

    if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
      clearCart();
      speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
      return;
    }

    const matchedProduct = findProductByText(text);
    if (!matchedProduct) {
      const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
      speak(msg, language);
      return;
    }

    if (matchedProduct.stock_quantity <= 0) {
      const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
      speak(typeof msg === 'function' ? msg(matchedProduct.name) : msg, language);
      return;
    }

    addToCart(matchedProduct);
    const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
    speak(typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg, language);

  }, [addToCart, clearCart, findProductByText, itemCount, language]);

  // ======== Handle Card Select ========
  const handleCardSelect = useCallback((product: Product) => {
    addToCart(product);
    const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
    speak(typeof msg === 'function' ? msg(product.name, 1) : msg, language);
  }, [addToCart, language]);

  // ======== Checkout ========
  const handleCheckout = async () => {
    if (!session || cart.length === 0) return;

    const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
    speak(msg, language);

    const order = await createOrder(session.id, cart, total);
    if (order) {
      setCurrentOrder(order);
      setStage('packing');
      packingSpokenRef.current = false;

      await startPickAndPack(order, cart);
    }
  };

  // ======== Watch Robot Progress ========
  useEffect(() => {
    if (stage !== 'packing') return;

    if (!packingSpokenRef.current && task?.status === 'picking') {
      packingSpokenRef.current = true;
      const msg = voiceMessages.robotPicking[language as keyof typeof voiceMessages.robotPicking] || voiceMessages.robotPicking.en;
      speak(msg, language);
    }

    if (task?.status === 'packing' && progress > 50 && progress < 60) {
      const msg = voiceMessages.robotPacking[language as keyof typeof voiceMessages.robotPacking] || voiceMessages.robotPacking.en;
      speak(msg, language);
    }

    if (progress >= 100) {
      const msg = voiceMessages.packingComplete[language as keyof typeof voiceMessages.packingComplete] || voiceMessages.packingComplete.en;
      speak(typeof msg === 'function' ? msg(total) : msg, language);
      setTimeout(() => setStage('payment'), 1000);
    }

  }, [task?.status, progress, language, stage, total]);

  // ======== Payment & Delivery ========
  const handlePaymentComplete = () => {
    setStage('delivery');
    const msg = voiceMessages.deliveryStarting[language as keyof typeof voiceMessages.deliveryStarting] || voiceMessages.deliveryStarting.en;
    speak(msg, language);
  };

  const handleDeliveryComplete = async () => {
    const msg = voiceMessages.thankYou[language as keyof typeof voiceMessages.thankYou] || voiceMessages.thankYou.en;
    speak(msg, language);

    clearCart();
    await endSession();
    setCurrentOrder(null);
    setStage('complete');

    setTimeout(() => setStage('greeting'), 5000);
  };

  // ======== Render Stages ========
  const renderStage = () => {
    switch (stage) {
      case 'greeting': return <GreetingScreen onStart={handleStart} />;

      case 'shopping':
        return (
          <div className="min-h-screen bg-background cyber-grid p-4 md:p-6">
            {/* Header */}
            <header className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Store className="w-8 h-8 text-primary" />
                <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-primary">
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">Voice Active</span>
                </div>
                <div className="flex items-center gap-2 text-success">
                  <Activity className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">System Ready</span>
                </div>
              </div>
            </header>

            {/* Products + Cart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <div className="glass rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-center gap-6">
                    <VoiceInput onVoiceResult={handleTextOrVoiceInput} isListening={isListening} setIsListening={setIsListening} language={language} />
                    <div className="hidden md:block h-16 w-px bg-border" />
                    <TextInput onSubmit={handleTextOrVoiceInput} placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'} />
                  </div>
                </div>

                <Tabs value={inputMode} onValueChange={v => setInputMode(v as 'cards' | 'browse')} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="cards">🎴 {language === 'sw' ? 'Kadi za Bidhaa' : 'Product Cards'}</TabsTrigger>
                    <TabsTrigger value="browse">📦 {language === 'sw' ? 'Vinjari' : 'Browse All'}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="cards">
                    <PhysicalCardBasket products={products} cart={cart} onSelectCard={handleCardSelect} />
                  </TabsContent>

                  <TabsContent value="browse">
                    <ProductGrid products={products} cart={cart} onAddToCart={addToCart} onUpdateQuantity={updateQuantity} />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="lg:col-span-1 sticky top-4">
                <CartPanel cart={cart} total={total} onUpdateQuantity={updateQuantity} onRemove={removeFromCart} onClear={clearCart} onCheckout={handleCheckout} language={language} />
              </div>
            </div>
          </div>
        );

      case 'packing':
        return (
          <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
            <div className="w-full max-w-2xl">
              <motion.h1 className="text-3xl font-orbitron text-center text-primary mb-8">
                {language === 'sw' ? 'Roboti Inafunga Bidhaa Zako' : 'Robot is Packing Your Order'}
              </motion.h1>
              <RobotAnimation
                status={task?.status || 'idle'}
                progress={progress}
                itemsTotal={cart.length}
                itemsPicked={task?.items_picked?.length || 0}
                itemsPacked={task?.items_packed?.length || 0}
                itemsList={task?.items_to_pick || []}
              />
            </div>
          </div>
        );

      case 'payment':
        return currentOrder ? (
          <PaymentScreen
            order={currentOrder}
            onPaymentComplete={handlePaymentComplete}
            language={language}
            onBack={() => setStage('shopping')} // ✅ Pass the new onBack prop
          />
        ) : null;

      case 'delivery':
        return currentOrder ? <DeliveryScreen orderId={currentOrder.id} onComplete={handleDeliveryComplete} language={language} /> : null;

      case 'complete':
        return (
          <div className="min-h-screen bg-background cyber-grid flex flex-col items-center justify-center p-6">
            <motion.div className="text-8xl mb-8">🎉</motion.div>
            <h1 className="text-4xl font-orbitron text-success text-center">{language === 'sw' ? 'Asante Sana!' : 'Thank You!'}</h1>
            <p className="text-xl text-muted-foreground mt-4">{language === 'sw' ? 'Karibuni tena!' : 'Visit us again!'}</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {renderStage()}
      </motion.div>
    </AnimatePresence>
  );
}




































// // working 100% only did int had pictures in the product cards 
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';
// import { hardwareBridge } from '@/lib/hardwarebridge';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus();
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();
//   const { task, progress, startPickAndPack } = useRobotSimulation();

//   const packingSpokenRef = useRef(false);

//   // ======== Hardware Bridge ========
//   useEffect(() => {
//     hardwareBridge.connect();
//     return () => hardwareBridge.disconnect();
//   }, []);

//   // ======== Session / Customer Start ========
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) setStage('shopping');
//   };

//   // ======== Find Product ========
//   const findProductByText = useCallback((text: string): Product | null => {
//     const lowerText = text.toLowerCase().trim();
//     let match = products.find(p =>
//       p.name.toLowerCase() === lowerText ||
//       (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
//       (p.card_code && p.card_code.toLowerCase() === lowerText)
//     );
//     if (!match) {
//       match = products.find(p =>
//         p.name.toLowerCase().includes(lowerText) ||
//         lowerText.includes(p.name.toLowerCase()) ||
//         (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
//       );
//     }
//     return match || null;
//   }, [products]);

//   // ======== Handle Voice/Text Input ========
//   const handleTextOrVoiceInput = useCallback((text: string) => {
//     const lowerText = text.toLowerCase();

//     if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
//       if (itemCount > 0) handleCheckout();
//       return;
//     }

//     if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
//       clearCart();
//       speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
//       return;
//     }

//     const matchedProduct = findProductByText(text);
//     if (!matchedProduct) {
//       const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
//       speak(msg, language);
//       return;
//     }

//     if (matchedProduct.stock_quantity <= 0) {
//       const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
//       speak(typeof msg === 'function' ? msg(matchedProduct.name) : msg, language);
//       return;
//     }

//     addToCart(matchedProduct);
//     const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//     speak(typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg, language);

//   }, [addToCart, clearCart, findProductByText, itemCount, language]);

//   // ======== Handle Card Select ========
//   const handleCardSelect = useCallback((product: Product) => {
//     addToCart(product);
//     const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//     speak(typeof msg === 'function' ? msg(product.name, 1) : msg, language);
//   }, [addToCart, language]);

//   // ======== Checkout ========
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;

//     const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
//     speak(msg, language);

//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');
//       packingSpokenRef.current = false;

//       // Use Robot Simulation / Hardware Bridge
//       await startPickAndPack(order, cart);
//     }
//   };

//   // ======== Watch Robot Progress ========
//   useEffect(() => {
//     if (stage !== 'packing') return;

//     if (!packingSpokenRef.current && task?.status === 'picking') {
//       packingSpokenRef.current = true;
//       const msg = voiceMessages.robotPicking[language as keyof typeof voiceMessages.robotPicking] || voiceMessages.robotPicking.en;
//       speak(msg, language);
//     }

//     if (task?.status === 'packing' && progress > 50 && progress < 60) {
//       const msg = voiceMessages.robotPacking[language as keyof typeof voiceMessages.robotPacking] || voiceMessages.robotPacking.en;
//       speak(msg, language);
//     }

//     if (progress >= 100) {
//       const msg = voiceMessages.packingComplete[language as keyof typeof voiceMessages.packingComplete] || voiceMessages.packingComplete.en;
//       speak(typeof msg === 'function' ? msg(total) : msg, language);
//       setTimeout(() => setStage('payment'), 1000);
//     }

//   }, [task?.status, progress, language, stage, total]);

//   // ======== Payment & Delivery ========
//   const handlePaymentComplete = () => {
//     setStage('delivery');
//     const msg = voiceMessages.deliveryStarting[language as keyof typeof voiceMessages.deliveryStarting] || voiceMessages.deliveryStarting.en;
//     speak(msg, language);
//   };

//   const handleDeliveryComplete = async () => {
//     const msg = voiceMessages.thankYou[language as keyof typeof voiceMessages.thankYou] || voiceMessages.thankYou.en;
//     speak(msg, language);

//     clearCart();
//     await endSession();
//     setCurrentOrder(null);
//     setStage('complete');

//     setTimeout(() => setStage('greeting'), 5000);
//   };

//   // ======== Render Stages ========
//   const renderStage = () => {
//     switch (stage) {
//       case 'greeting': return <GreetingScreen onStart={handleStart} />;

//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background cyber-grid p-4 md:p-6">
//             {/* Header */}
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//               <div className="flex items-center gap-4">
//                 <div className="flex items-center gap-2 text-primary">
//                   <Volume2 className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">Voice Active</span>
//                 </div>
//                 <div className="flex items-center gap-2 text-success">
//                   <Activity className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">System Ready</span>
//                 </div>
//               </div>
//             </header>

//             {/* Products + Cart */}
//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
//               <div className="lg:col-span-2 space-y-4">
//                 <div className="glass rounded-xl p-4">
//                   <div className="flex flex-wrap items-center justify-center gap-6">
//                     <VoiceInput onVoiceResult={handleTextOrVoiceInput} isListening={isListening} setIsListening={setIsListening} language={language} />
//                     <div className="hidden md:block h-16 w-px bg-border" />
//                     <TextInput onSubmit={handleTextOrVoiceInput} placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'} />
//                   </div>
//                 </div>

//                 <Tabs value={inputMode} onValueChange={v => setInputMode(v as 'cards' | 'browse')} className="w-full">
//                   <TabsList className="grid w-full grid-cols-2">
//                     <TabsTrigger value="cards">🎴 {language === 'sw' ? 'Kadi za Bidhaa' : 'Product Cards'}</TabsTrigger>
//                     <TabsTrigger value="browse">📦 {language === 'sw' ? 'Vinjari' : 'Browse All'}</TabsTrigger>
//                   </TabsList>

//                   <TabsContent value="cards">
//                     <PhysicalCardBasket products={products} cart={cart} onSelectCard={handleCardSelect} />
//                   </TabsContent>

//                   <TabsContent value="browse">
//                     <ProductGrid products={products} cart={cart} onAddToCart={addToCart} onUpdateQuantity={updateQuantity} />
//                   </TabsContent>
//                 </Tabs>
//               </div>

//               <div className="lg:col-span-1 sticky top-4">
//                 <CartPanel cart={cart} total={total} onUpdateQuantity={updateQuantity} onRemove={removeFromCart} onClear={clearCart} onCheckout={handleCheckout} language={language} />
//               </div>
//             </div>
//           </div>
//         );

//       case 'packing':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-2xl">
//               <motion.h1 className="text-3xl font-orbitron text-center text-primary mb-8">
//                 {language === 'sw' ? 'Roboti Inafunga Bidhaa Zako' : 'Robot is Packing Your Order'}
//               </motion.h1>
//               <RobotAnimation
//                 status={task?.status || 'idle'}
//                 progress={progress}
//                 itemsTotal={cart.length}
//                 itemsPicked={task?.items_picked?.length || 0}
//                 itemsPacked={task?.items_packed?.length || 0}
//                 itemsList={task?.items_to_pick || []}
//               />
//             </div>
//           </div>
//         );

//       case 'payment':
//         return currentOrder ? <PaymentScreen order={currentOrder} onPaymentComplete={handlePaymentComplete} language={language} /> : null;
//       case 'delivery':
//         return currentOrder ? <DeliveryScreen orderId={currentOrder.id} onComplete={handleDeliveryComplete} language={language} /> : null;
//       case 'complete':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex flex-col items-center justify-center p-6">
//             <motion.div className="text-8xl mb-8">🎉</motion.div>
//             <h1 className="text-4xl font-orbitron text-success text-center">{language === 'sw' ? 'Asante Sana!' : 'Thank You!'}</h1>
//             <p className="text-xl text-muted-foreground mt-4">{language === 'sw' ? 'Karibuni tena!' : 'Visit us again!'}</p>
//           </div>
//         );
//       default: return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
// }






































// //super nice only not synced 
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';
// import { hardwareBridge } from '@/lib/hardwarebridge';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus(); // Keep status subscription active
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();
//   const { task, progress, startPickAndPack } = useRobotSimulation();

//   const hasSpokenPackingRef = useRef(false);
//   const _hasSpokenPaymentRef = useRef(false);

//   // Initialize hardware bridge (connects to Arduino via serial-bridge)
//   useEffect(() => {
//     hardwareBridge.connect();
//     return () => hardwareBridge.disconnect();
//   }, []);

//   // Handle customer entry
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) {
//       setStage('shopping');
//     }
//   };

//   // Find product by text (voice or typed)
//   const findProductByText = useCallback((text: string): Product | null => {
//     const lowerText = text.toLowerCase().trim();
    
//     // Try exact match first
//     let matched = products.find(p => 
//       p.name.toLowerCase() === lowerText ||
//       (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
//       (p.card_code && p.card_code.toLowerCase() === lowerText)
//     );
    
//     // Try partial match
//     if (!matched) {
//       matched = products.find(p => 
//         p.name.toLowerCase().includes(lowerText) ||
//         lowerText.includes(p.name.toLowerCase()) ||
//         (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
//       );
//     }
    
//     return matched || null;
//   }, [products]);

//   // Handle voice/text input - auto-add products
//   const handleTextOrVoiceInput = useCallback((text: string) => {
//     const lowerText = text.toLowerCase();
    
//     // Check for checkout commands
//     if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
//       if (itemCount > 0) {
//         handleCheckout();
//         return;
//       }
//     }
    
//     // Check for clear cart commands
//     if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
//       clearCart();
//       speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
//       return;
//     }
    
//     // Try to find and add product
//     const matchedProduct = findProductByText(text);
    
//     if (matchedProduct) {
//       if (matchedProduct.stock_quantity <= 0) {
//         // Out of stock
//         const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name) : msg;
//         speak(message, language);
//       } else {
//         // Add to cart
//         addToCart(matchedProduct);
//         const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg;
//         speak(message, language);
//       }
//     } else {
//       // No match found
//       const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
//       speak(msg, language);
//     }
//   }, [products, addToCart, itemCount, language, findProductByText, clearCart]);

//   // Handle card selection from basket
//   const handleCardSelect = useCallback((product: Product) => {
//     addToCart(product);
//     const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//     const message = typeof msg === 'function' ? msg(product.name, 1) : msg;
//     speak(message, language);
//   }, [addToCart, language]);

//   // Handle checkout
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;
    
//     // Speak checkout message
//     const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
//     speak(msg, language);
    
//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');
//       hasSpokenPackingRef.current = false;
      
//       // Start robot simulation
//       await startPickAndPack(order, cart);
//     }
//   };

//   // Watch robot progress and speak updates
//   useEffect(() => {
//     if (stage === 'packing') {
//       if (!hasSpokenPackingRef.current && task?.status === 'picking') {
//         hasSpokenPackingRef.current = true;
//         const msg = voiceMessages.robotPicking[language as keyof typeof voiceMessages.robotPicking] || voiceMessages.robotPicking.en;
//         speak(msg, language);
//       }
      
//       if (task?.status === 'packing' && progress < 100) {
//         // Already packing, speak once
//         if (progress > 50 && progress < 60) {
//           const msg = voiceMessages.robotPacking[language as keyof typeof voiceMessages.robotPacking] || voiceMessages.robotPacking.en;
//           speak(msg, language);
//         }
//       }
      
//       if (progress >= 100) {
//         // Packing complete, move to payment
//         const msg = voiceMessages.packingComplete[language as keyof typeof voiceMessages.packingComplete] || voiceMessages.packingComplete.en;
//         const message = typeof msg === 'function' ? msg(total) : msg;
//         speak(message, language);
        
//         setTimeout(() => setStage('payment'), 2000);
//       }
//     }
//   }, [progress, stage, task?.status, language, total]);

//   // Handle payment complete
//   const handlePaymentComplete = () => {
//     setStage('delivery');
//     const msg = voiceMessages.deliveryStarting[language as keyof typeof voiceMessages.deliveryStarting] || voiceMessages.deliveryStarting.en;
//     speak(msg, language);
//   };

//   // Handle delivery complete
//   const handleDeliveryComplete = async () => {
//     // Speak thank you
//     const msg = voiceMessages.thankYou[language as keyof typeof voiceMessages.thankYou] || voiceMessages.thankYou.en;
//     speak(msg, language);
    
//     clearCart();
//     await endSession();
//     setCurrentOrder(null);
//     setStage('complete');
    
//     setTimeout(() => {
//       setStage('greeting');
//     }, 5000);
//   };

//   // Render based on stage
//   const renderStage = () => {
//     switch (stage) {
//       case 'greeting':
//         return <GreetingScreen onStart={handleStart} />;

//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background cyber-grid p-4 md:p-6">
//             {/* Header */}
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//               <div className="flex items-center gap-4">
//                 <div className="flex items-center gap-2 text-primary">
//                   <Volume2 className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">Voice Active</span>
//                 </div>
//                 <div className="flex items-center gap-2 text-success">
//                   <Activity className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">System Ready</span>
//                 </div>
//               </div>
//             </header>

//             {/* Main layout */}
//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
//               {/* Products area */}
//               <div className="lg:col-span-2 space-y-4">
//                 {/* Input methods */}
//                 <div className="glass rounded-xl p-4">
//                   <div className="flex flex-wrap items-center justify-center gap-6">
//                     {/* Voice input */}
//                     <div className="flex flex-col items-center gap-2">
//                       <VoiceInput
//                         onVoiceResult={handleTextOrVoiceInput}
//                         isListening={isListening}
//                         setIsListening={setIsListening}
//                         language={language}
//                       />
//                       <span className="text-sm text-muted-foreground">
//                         {language === 'sw' ? 'Sema' : 'Speak'}
//                       </span>
//                     </div>

//                     {/* Divider */}
//                     <div className="hidden md:block h-16 w-px bg-border" />

//                     {/* Text input */}
//                     <div className="flex-1 min-w-[200px] max-w-md">
//                       <TextInput
//                         onSubmit={handleTextOrVoiceInput}
//                         placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'}
//                       />
//                     </div>
//                   </div>
//                 </div>

//                 {/* Product display tabs */}
//                 <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'cards' | 'browse')} className="w-full">
//                   <TabsList className="grid w-full grid-cols-2">
//                     <TabsTrigger value="cards" className="text-lg">
//                       🎴 {language === 'sw' ? 'Kadi za Bidhaa' : 'Product Cards'}
//                     </TabsTrigger>
//                     <TabsTrigger value="browse" className="text-lg">
//                       📦 {language === 'sw' ? 'Vinjari' : 'Browse All'}
//                     </TabsTrigger>
//                   </TabsList>
                  
//                   <TabsContent value="cards" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <PhysicalCardBasket
//                         products={products}
//                         cart={cart}
//                         onSelectCard={handleCardSelect}
//                       />
//                     )}
//                   </TabsContent>
                  
//                   <TabsContent value="browse" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <ProductGrid
//                         products={products}
//                         cart={cart}
//                         onAddToCart={addToCart}
//                         onUpdateQuantity={updateQuantity}
//                       />
//                     )}
//                   </TabsContent>
//                 </Tabs>
//               </div>

//               {/* Cart panel */}
//               <div className="lg:col-span-1">
//                 <div className="sticky top-4">
//                   <CartPanel
//                     cart={cart}
//                     total={total}
//                     onUpdateQuantity={updateQuantity}
//                     onRemove={removeFromCart}
//                     onClear={clearCart}
//                     onCheckout={handleCheckout}
//                     language={language}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//         );

//       case 'packing':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-2xl">
//               <motion.h1
//                 initial={{ opacity: 0, y: -20 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 className="text-3xl font-orbitron text-center text-primary mb-8"
//               >
//                 {language === 'sw' ? 'Roboti Inafunga Bidhaa Zako' : 'Robot is Packing Your Order'}
//               </motion.h1>
//               <RobotAnimation
//                 status={task?.status || 'idle'}
//                 progress={progress}
//                 itemsTotal={cart.length}
//                 itemsPicked={task?.items_picked?.length || 0}
//                 itemsPacked={task?.items_packed?.length || 0}
//                 itemsList={task?.items_to_pick || []}
//               />
//             </div>
//           </div>
//         );

//       case 'payment':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-md">
//               {currentOrder && (
//                 <PaymentScreen
//                   order={currentOrder}
//                   onPaymentComplete={handlePaymentComplete}
//                   language={language}
//                 />
//               )}
//             </div>
//           </div>
//         );

//       case 'delivery':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-lg">
//               {currentOrder && (
//                 <DeliveryScreen
//                   orderId={currentOrder.id}
//                   onComplete={handleDeliveryComplete}
//                   language={language}
//                 />
//               )}
//             </div>
//           </div>
//         );

//       case 'complete':
//         return (
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             className="min-h-screen bg-background cyber-grid flex flex-col items-center justify-center p-6"
//           >
//             <motion.div
//               initial={{ scale: 0 }}
//               animate={{ scale: 1 }}
//               transition={{ type: 'spring', bounce: 0.5 }}
//               className="text-8xl mb-8"
//             >
//               🎉
//             </motion.div>
//             <h1 className="text-4xl font-orbitron text-success text-center">
//               {language === 'sw' ? 'Asante Sana!' : language === 'fr' ? 'Merci Beaucoup!' : 'Thank You!'}
//             </h1>
//             <p className="text-xl text-muted-foreground mt-4">
//               {language === 'sw' ? 'Karibuni tena!' : language === 'fr' ? 'À bientôt!' : 'Visit us again!'}
//             </p>
//           </motion.div>
//         );

//       default:
//         return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div
//         key={stage}
//         initial={{ opacity: 0 }}
//         animate={{ opacity: 1 }}
//         exit={{ opacity: 0 }}
//       >
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
// }






































// close to reality but its stack forever 
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus();
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();
//   const { task, progress, startPickAndPack } = useRobotSimulation();

//   const wsRef = useRef<WebSocket | null>(null);
//   const hasSpokenPackingRef = useRef(false);

//   // ================= WEBSOCKET TO HARDWARE BRIDGE =================
//   useEffect(() => {
//     const ws = new WebSocket('ws://localhost:8765');
//     wsRef.current = ws;

//     ws.onopen = () => console.log('[KIOSK] Connected to hardware bridge');
//     ws.onclose = () => console.log('[KIOSK] Disconnected from hardware bridge');
//     ws.onerror = (e) => console.error('[KIOSK] WS error:', e);

//     ws.onmessage = (event) => {
//       const msg = JSON.parse(event.data);

//       if (msg.type === 'DONE') {
//         switch (msg.command) {
//           case 'PICK':
//             console.log('[KIOSK] Picking done, start packing');
//             sendCommand('PACK', cart.length);
//             break;
//           case 'PACK':
//             console.log('[KIOSK] Packing done, start conveyor');
//             sendCommand('CONVEYOR', 'START');
//             break;
//           case 'CONVEYOR':
//             console.log('[KIOSK] Conveyor done, start delivery');
//             sendCommand('DELIVER');
//             break;
//           case 'DELIVER':
//             console.log('[KIOSK] Delivery done, start collect');
//             sendCommand('COLLECT', 1);
//             break;
//           case 'COLLECT':
//             console.log('[KIOSK] Collection done, move to payment');
//             setTimeout(() => setStage('payment'), 1500);
//             break;
//         }
//       }
//     };

//     return () => ws.close();
//   }, [cart]);

//   // ================= SEND COMMAND =================
//   const sendCommand = (command: string, params?: any) => {
//     if (wsRef.current?.readyState === WebSocket.OPEN) {
//       wsRef.current.send(JSON.stringify({ command, params }));
//     }
//   };

//   // ================= CUSTOMER ENTRY =================
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) setStage('shopping');
//   };

//   // ================= FIND PRODUCT =================
//   const findProductByText = useCallback((text: string): Product | null => {
//     const lowerText = text.toLowerCase().trim();
//     let matched = products.find(p =>
//       p.name.toLowerCase() === lowerText ||
//       (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
//       (p.card_code && p.card_code.toLowerCase() === lowerText)
//     );
//     if (!matched) {
//       matched = products.find(p =>
//         p.name.toLowerCase().includes(lowerText) ||
//         lowerText.includes(p.name.toLowerCase()) ||
//         (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
//       );
//     }
//     return matched || null;
//   }, [products]);

//   // ================= HANDLE INPUT =================
//   const handleTextOrVoiceInput = useCallback((text: string) => {
//     const lowerText = text.toLowerCase();

//     if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
//       if (itemCount > 0) handleCheckout();
//       return;
//     }

//     if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
//       clearCart();
//       speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
//       return;
//     }

//     const matchedProduct = findProductByText(text);

//     if (matchedProduct) {
//       if (matchedProduct.stock_quantity <= 0) {
//         const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name) : msg;
//         speak(message, language);
//       } else {
//         addToCart(matchedProduct);
//         const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg;
//         speak(message, language);
//       }
//     } else {
//       const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
//       speak(msg, language);
//     }
//   }, [products, addToCart, itemCount, language, findProductByText, clearCart]);

//   // ================= HANDLE CARD SELECTION =================
//   const handleCardSelect = useCallback((product: Product) => {
//     addToCart(product);
//     const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//     const message = typeof msg === 'function' ? msg(product.name, 1) : msg;
//     speak(message, language);
//   }, [addToCart, language]);

//   // ================= HANDLE CHECKOUT =================
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;

//     const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
//     speak(msg, language);

//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');
//       hasSpokenPackingRef.current = false;

//       // Start automated picking & packing (system-driven)
//       await startPickAndPack(order, cart);
//       // Hardware commands will continue automatically via WebSocket 'DONE' messages
//       sendCommand('PICK', cart.length);
//     }
//   };

//   // ================= RENDER STAGES =================
//   const renderStage = () => {
//     switch (stage) {
//       case 'greeting':
//         return <GreetingScreen onStart={handleStart} />;

//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background p-4 md:p-6">
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//               <div className="flex items-center gap-4">
//                 <div className="flex items-center gap-2 text-primary">
//                   <Volume2 className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">Voice Active</span>
//                 </div>
//                 <div className="flex items-center gap-2 text-success">
//                   <Activity className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">System Ready</span>
//                 </div>
//               </div>
//             </header>

//             {/* Main layout */}
//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
//               {/* Products */}
//               <div className="lg:col-span-2 space-y-4">
//                 {/* Inputs */}
//                 <div className="glass rounded-xl p-4">
//                   <div className="flex flex-wrap items-center justify-center gap-6">
//                     <VoiceInput
//                       onVoiceResult={handleTextOrVoiceInput}
//                       isListening={isListening}
//                       setIsListening={setIsListening}
//                       language={language}
//                     />
//                     <TextInput
//                       onSubmit={handleTextOrVoiceInput}
//                       placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'}
//                     />
//                   </div>
//                 </div>

//                 {/* Product Tabs */}
//                 <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'cards' | 'browse')} className="w-full">
//                   <TabsList className="grid w-full grid-cols-2">
//                     <TabsTrigger value="cards" className="text-lg">
//                       🎴 {language === 'sw' ? 'Kadi za Bidhaa' : 'Product Cards'}
//                     </TabsTrigger>
//                     <TabsTrigger value="browse" className="text-lg">
//                       📦 {language === 'sw' ? 'Vinjari' : 'Browse All'}
//                     </TabsTrigger>
//                   </TabsList>

//                   <TabsContent value="cards" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <PhysicalCardBasket
//                         products={products}
//                         cart={cart}
//                         onSelectCard={handleCardSelect}
//                       />
//                     )}
//                   </TabsContent>

//                   <TabsContent value="browse" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <ProductGrid
//                         products={products}
//                         cart={cart}
//                         onAddToCart={addToCart}
//                         onUpdateQuantity={updateQuantity}
//                       />
//                     )}
//                   </TabsContent>
//                 </Tabs>
//               </div>

//               {/* Cart Panel */}
//               <div className="lg:col-span-1">
//                 <div className="sticky top-4">
//                   <CartPanel
//                     cart={cart}
//                     total={total}
//                     onUpdateQuantity={updateQuantity}
//                     onRemove={removeFromCart}
//                     onClear={clearCart}
//                     onCheckout={handleCheckout}
//                     language={language}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//         );

//       case 'packing':
//         return (
//           <div className="min-h-screen bg-background flex items-center justify-center p-6">
//             <div className="w-full max-w-2xl">
//               <RobotAnimation
//                 status={task?.status || 'idle'}
//                 progress={progress}
//                 itemsTotal={cart.length}
//                 itemsPicked={task?.items_picked?.length || 0}
//                 itemsPacked={task?.items_packed?.length || 0}
//                 itemsList={task?.items_to_pick || []}
//               />
//             </div>
//           </div>
//         );

//       case 'payment':
//         return currentOrder ? (
//           <PaymentScreen
//             order={currentOrder}
//             onPaymentComplete={() => setStage('delivery')}
//             language={language}
//           />
//         ) : null;

//       case 'delivery':
//         return currentOrder ? (
//           <DeliveryScreen
//             orderId={currentOrder.id}
//             onComplete={() => setStage('complete')}
//             language={language}
//           />
//         ) : null;

//       case 'complete':
//         return (
//           <div className="min-h-screen flex flex-col items-center justify-center p-6">
//             🎉 Thank You!
//           </div>
//         );

//       default:
//         return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
// }


































// better but no cards and then its stack forever on scan
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus();
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();
//   const { task, progress } = useRobotSimulation();

//   const wsRef = useRef<WebSocket | null>(null);
//   const hasSpokenPackingRef = useRef(false);

//   // ================= WEBSOCKET TO BRIDGE =================
//   useEffect(() => {
//     const ws = new WebSocket('ws://localhost:8765');
//     wsRef.current = ws;

//     ws.onopen = () => console.log('[KIOSK] Connected to hardware bridge');
//     ws.onclose = () => console.log('[KIOSK] Disconnected from hardware bridge');
//     ws.onerror = (e) => console.error('[KIOSK] WS error:', e);

//     ws.onmessage = (event) => {
//       const msg = JSON.parse(event.data);
//       // Listen for hardware events
//       if (msg.type === 'DONE') {
//         switch (msg.command) {
//           case 'PICK':
//             sendCommand('PACK', cart.length);
//             break;
//           case 'PACK':
//             sendCommand('CONVEYOR', 'START');
//             break;
//           case 'CONVEYOR':
//             sendCommand('DELIVER');
//             break;
//           case 'DELIVER':
//             sendCommand('COLLECT', 1);
//             break;
//           case 'COLLECT':
//             setTimeout(() => setStage('payment'), 1500);
//             break;
//         }
//       }
//     };

//     return () => ws.close();
//   }, [cart]);

//   // ================= SEND COMMAND WRAPPER =================
//   const sendCommand = (command: string, params?: any) => {
//     if (wsRef.current?.readyState === WebSocket.OPEN) {
//       wsRef.current.send(JSON.stringify({ command, params }));
//     }
//   };

//   // ================= HANDLE CUSTOMER ENTRY =================
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) setStage('shopping');
//   };

//   // ================= FIND PRODUCT =================
//   const findProductByText = useCallback((text: string): Product | null => {
//     const lowerText = text.toLowerCase().trim();
//     let matched = products.find(p =>
//       p.name.toLowerCase() === lowerText ||
//       (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
//       (p.card_code && p.card_code.toLowerCase() === lowerText)
//     );
//     if (!matched) {
//       matched = products.find(p =>
//         p.name.toLowerCase().includes(lowerText) ||
//         lowerText.includes(p.name.toLowerCase()) ||
//         (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
//       );
//     }
//     return matched || null;
//   }, [products]);

//   // ================= HANDLE INPUT =================
//   const handleTextOrVoiceInput = useCallback((text: string) => {
//     const lowerText = text.toLowerCase();

//     if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
//       if (itemCount > 0) handleCheckout();
//       return;
//     }

//     if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
//       clearCart();
//       speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
//       return;
//     }

//     const matchedProduct = findProductByText(text);

//     if (matchedProduct) {
//       if (matchedProduct.stock_quantity <= 0) {
//         const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name) : msg;
//         speak(message, language);
//       } else {
//         addToCart(matchedProduct);
//         const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg;
//         speak(message, language);
//       }
//     } else {
//       const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
//       speak(msg, language);
//     }
//   }, [products, addToCart, itemCount, language, findProductByText, clearCart]);

//   // ================= HANDLE CHECKOUT =================
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;
//     const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
//     speak(msg, language);

//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');
//       hasSpokenPackingRef.current = false;

//       // ================= START PICKING VIA HARDWARE =================
//       sendCommand('PICK', cart.length);
//     }
//   };

//   // ================= RENDER STAGES =================
//   const renderStage = () => {
//     switch (stage) {
//       case 'greeting':
//         return <GreetingScreen onStart={handleStart} />;
//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background p-4 md:p-6">
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//               <div className="flex items-center gap-4">
//                 <div className="flex items-center gap-2 text-primary">
//                   <Volume2 className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">Voice Active</span>
//                 </div>
//                 <div className="flex items-center gap-2 text-success">
//                   <Activity className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">System Ready</span>
//                 </div>
//               </div>
//             </header>

//             {/* Main layout */}
//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
//               <div className="lg:col-span-2 space-y-4">
//                 {/* Inputs */}
//                 <div className="glass rounded-xl p-4">
//                   <div className="flex flex-wrap items-center justify-center gap-6">
//                     <VoiceInput
//                       onVoiceResult={handleTextOrVoiceInput}
//                       isListening={isListening}
//                       setIsListening={setIsListening}
//                       language={language}
//                     />
//                     <TextInput
//                       onSubmit={handleTextOrVoiceInput}
//                       placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'}
//                     />
//                   </div>
//                 </div>
//               </div>
//               <div className="lg:col-span-1">
//                 <CartPanel
//                   cart={cart}
//                   total={total}
//                   onUpdateQuantity={updateQuantity}
//                   onRemove={removeFromCart}
//                   onClear={clearCart}
//                   onCheckout={handleCheckout}
//                   language={language}
//                 />
//               </div>
//             </div>
//           </div>
//         );
//       case 'packing':
//         return (
//           <div className="min-h-screen bg-background flex items-center justify-center p-6">
//             <div className="w-full max-w-2xl">
//               <RobotAnimation
//                 status={task?.status || 'idle'}
//                 progress={progress}
//                 itemsTotal={cart.length}
//                 itemsPicked={task?.items_picked?.length || 0}
//                 itemsPacked={task?.items_packed?.length || 0}
//                 itemsList={task?.items_to_pick || []}
//               />
//             </div>
//           </div>
//         );
//       case 'payment':
//         return currentOrder ? <PaymentScreen order={currentOrder} onPaymentComplete={() => setStage('delivery')} language={language} /> : null;
//       case 'delivery':
//         return currentOrder ? <DeliveryScreen orderId={currentOrder.id} onComplete={() => setStage('complete')} language={language} /> : null;
//       case 'complete':
//         return <div className="min-h-screen flex flex-col items-center justify-center p-6">🎉 Thank You!</div>;
//       default:
//         return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
// }





































//ui is sweat but waits forever 
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';
// import { hardwareBridge } from '@/lib/hardwarebridge';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus();
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();

//   // KEEP simulation hook so UI doesn't break — but we won't use its timer
//   const { task, progress, startPickAndPack } = useRobotSimulation();

//   const hasSpokenPackingRef = useRef(false);

//   // ===== CONNECT TO HARDWARE =====
//   useEffect(() => {
//     hardwareBridge.connect();
//     return () => hardwareBridge.disconnect();
//   }, []);

//   // ===== LISTEN TO REAL ROBOT EVENTS =====
//   useEffect(() => {
//     const unsub = hardwareBridge.onMessage((msg) => {

//       if (msg.type === 'DONE') {

//         if (msg.command === 'PICK') {
//           hardwareBridge.sendCommand("PACK", cart.length);
//         }

//         else if (msg.command === 'PACK') {
//           hardwareBridge.sendCommand("CONVEYOR", "START");
//         }

//         else if (msg.command === 'CONVEYOR') {
//           hardwareBridge.sendCommand("DELIVER");
//         }

//         else if (msg.command === 'DELIVER') {
//           hardwareBridge.sendCommand("COLLECT", 1);
//         }

//         else if (msg.command === 'COLLECT') {
//           setTimeout(() => setStage('payment'), 1500);
//         }

//       }

//     });

//     return () => unsub();
//   }, [cart]);

//   // ===== START SESSION =====
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) setStage('shopping');
//   };

//   // ===== CHECKOUT =====
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;

//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');

//       // ❌ OLD FAKE TIMER
//       // await startPickAndPack(order, cart);

//       // ✅ REAL ROBOT START
//       hardwareBridge.sendCommand("PICK", cart.length);
//     }
//   };

//   // ===== PAYMENT COMPLETE =====
//   const handlePaymentComplete = () => {
//     setStage('delivery');
//   };

//   // ===== DELIVERY COMPLETE =====
//   const handleDeliveryComplete = async () => {
//     clearCart();
//     await endSession();
//     setCurrentOrder(null);
//     setStage('complete');
//     setTimeout(() => setStage('greeting'), 5000);
//   };

//   // ===== RENDER =====
//   const renderStage = () => {
//     switch (stage) {

//       case 'greeting':
//         return <GreetingScreen onStart={handleStart} />;

//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background cyber-grid p-4 md:p-6">
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//             </header>

//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

//               <div className="lg:col-span-2 space-y-4">

//                 <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'cards' | 'browse')}>
//                   <TabsList className="grid w-full grid-cols-2">
//                     <TabsTrigger value="cards">Product Cards</TabsTrigger>
//                     <TabsTrigger value="browse">Browse All</TabsTrigger>
//                   </TabsList>

//                   <TabsContent value="cards" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">Loading...</div>
//                     ) : (
//                       <PhysicalCardBasket
//                         products={products}
//                         cart={cart}
//                         onSelectCard={addToCart}
//                       />
//                     )}
//                   </TabsContent>

//                   <TabsContent value="browse" className="mt-4">
//                     <ProductGrid
//                       products={products}
//                       cart={cart}
//                       onAddToCart={addToCart}
//                       onUpdateQuantity={updateQuantity}
//                     />
//                   </TabsContent>
//                 </Tabs>
//               </div>

//               <div className="lg:col-span-1">
//                 <CartPanel
//                   cart={cart}
//                   total={total}
//                   onUpdateQuantity={updateQuantity}
//                   onRemove={removeFromCart}
//                   onClear={clearCart}
//                   onCheckout={handleCheckout}
//                   language={language}
//                 />
//               </div>

//             </div>
//           </div>
//         );

//       case 'packing':
//         return (
//           <div className="min-h-screen flex items-center justify-center">
//             <RobotAnimation
//               status={task?.status || 'idle'}
//               progress={progress}
//               itemsTotal={cart.length}
//               itemsPicked={0}
//               itemsPacked={0}
//               itemsList={[]}
//             />
//           </div>
//         );

//       case 'payment':
//         return currentOrder && (
//           <PaymentScreen
//             order={currentOrder}
//             onPaymentComplete={handlePaymentComplete}
//             language={language}
//           />
//         );

//       case 'delivery':
//         return currentOrder && (
//           <DeliveryScreen
//             orderId={currentOrder.id}
//             onComplete={handleDeliveryComplete}
//             language={language}
//           />
//         );

//       case 'complete':
//         return (
//           <div className="min-h-screen flex items-center justify-center">
//             <h1>Thank You!</h1>
//           </div>
//         );

//       default:
//         return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
//}




































// super nice only not synced 
// import { useState, useEffect, useCallback, useRef } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { Store, Activity, Volume2 } from 'lucide-react';
// import { GreetingScreen } from '@/components/kiosk/GreetingScreen';
// import { ProductGrid } from '@/components/kiosk/ProductGrid';
// import { PhysicalCardBasket } from '@/components/kiosk/PhysicalCardBasket';
// import { CartPanel } from '@/components/kiosk/CartPanel';
// import { VoiceInput } from '@/components/kiosk/VoiceInput';
// import { TextInput } from '@/components/kiosk/TextInput';
// import { RobotAnimation } from '@/components/kiosk/RobotAnimation';
// import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
// import { DeliveryScreen } from '@/components/kiosk/DeliveryScreen';
// import { useProducts, useShopStatus, useCart, useSession, useOrders, useRobotSimulation } from '@/hooks/useShop';
// import { Order, Product } from '@/types/shop';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';
// import { hardwareBridge } from '@/lib/hardwarebridge';

// type KioskStage = 'greeting' | 'shopping' | 'checkout' | 'packing' | 'payment' | 'delivery' | 'complete';

// export default function CustomerKiosk() {
//   const [stage, setStage] = useState<KioskStage>('greeting');
//   const [language, setLanguage] = useState('en');
//   const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
//   const [isListening, setIsListening] = useState(false);
//   const [inputMode, setInputMode] = useState<'cards' | 'browse'>('cards');

//   const { products, loading: productsLoading } = useProducts();
//   useShopStatus(); // Keep status subscription active
//   const { cart, addToCart, updateQuantity, removeFromCart, clearCart, total, itemCount } = useCart();
//   const { session, startSession, endSession } = useSession();
//   const { createOrder } = useOrders();
//   const { task, progress, startPickAndPack } = useRobotSimulation();

//   const hasSpokenPackingRef = useRef(false);
//   const _hasSpokenPaymentRef = useRef(false);

//   // Initialize hardware bridge (connects to Arduino via serial-bridge)
//   useEffect(() => {
//     hardwareBridge.connect();
//     return () => hardwareBridge.disconnect();
//   }, []);

//   // Handle customer entry
//   const handleStart = async (selectedLanguage: string) => {
//     setLanguage(selectedLanguage);
//     const newSession = await startSession(selectedLanguage);
//     if (newSession) {
//       setStage('shopping');
//     }
//   };

//   // Find product by text (voice or typed)
//   const findProductByText = useCallback((text: string): Product | null => {
//     const lowerText = text.toLowerCase().trim();
    
//     // Try exact match first
//     let matched = products.find(p => 
//       p.name.toLowerCase() === lowerText ||
//       (p.name_swahili && p.name_swahili.toLowerCase() === lowerText) ||
//       (p.card_code && p.card_code.toLowerCase() === lowerText)
//     );
    
//     // Try partial match
//     if (!matched) {
//       matched = products.find(p => 
//         p.name.toLowerCase().includes(lowerText) ||
//         lowerText.includes(p.name.toLowerCase()) ||
//         (p.name_swahili && (p.name_swahili.toLowerCase().includes(lowerText) || lowerText.includes(p.name_swahili.toLowerCase())))
//       );
//     }
    
//     return matched || null;
//   }, [products]);

//   // Handle voice/text input - auto-add products
//   const handleTextOrVoiceInput = useCallback((text: string) => {
//     const lowerText = text.toLowerCase();
    
//     // Check for checkout commands
//     if (lowerText.includes('checkout') || lowerText.includes('pay') || lowerText.includes('lipa') || lowerText.includes('done') || lowerText.includes('finish')) {
//       if (itemCount > 0) {
//         handleCheckout();
//         return;
//       }
//     }
    
//     // Check for clear cart commands
//     if (lowerText.includes('clear') || lowerText.includes('ondoa') || lowerText.includes('remove all')) {
//       clearCart();
//       speak(language === 'sw' ? 'Kikapu kimesafishwa' : 'Cart cleared', language);
//       return;
//     }
    
//     // Try to find and add product
//     const matchedProduct = findProductByText(text);
    
//     if (matchedProduct) {
//       if (matchedProduct.stock_quantity <= 0) {
//         // Out of stock
//         const msg = voiceMessages.outOfStock[language as keyof typeof voiceMessages.outOfStock] || voiceMessages.outOfStock.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name) : msg;
//         speak(message, language);
//       } else {
//         // Add to cart
//         addToCart(matchedProduct);
//         const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//         const message = typeof msg === 'function' ? msg(matchedProduct.name, 1) : msg;
//         speak(message, language);
//       }
//     } else {
//       // No match found
//       const msg = voiceMessages.noMatch[language as keyof typeof voiceMessages.noMatch] || voiceMessages.noMatch.en;
//       speak(msg, language);
//     }
//   }, [products, addToCart, itemCount, language, findProductByText, clearCart]);

//   // Handle card selection from basket
//   const handleCardSelect = useCallback((product: Product) => {
//     addToCart(product);
//     const msg = voiceMessages.itemAdded[language as keyof typeof voiceMessages.itemAdded] || voiceMessages.itemAdded.en;
//     const message = typeof msg === 'function' ? msg(product.name, 1) : msg;
//     speak(message, language);
//   }, [addToCart, language]);

//   // Handle checkout
//   const handleCheckout = async () => {
//     if (!session || cart.length === 0) return;
    
//     // Speak checkout message
//     const msg = voiceMessages.checkoutStarting[language as keyof typeof voiceMessages.checkoutStarting] || voiceMessages.checkoutStarting.en;
//     speak(msg, language);
    
//     const order = await createOrder(session.id, cart, total);
//     if (order) {
//       setCurrentOrder(order);
//       setStage('packing');
//       hasSpokenPackingRef.current = false;
      
//       // Start robot simulation
//       await startPickAndPack(order, cart);
//     }
//   };

//   // Watch robot progress and speak updates
//   useEffect(() => {
//     if (stage === 'packing') {
//       if (!hasSpokenPackingRef.current && task?.status === 'picking') {
//         hasSpokenPackingRef.current = true;
//         const msg = voiceMessages.robotPicking[language as keyof typeof voiceMessages.robotPicking] || voiceMessages.robotPicking.en;
//         speak(msg, language);
//       }
      
//       if (task?.status === 'packing' && progress < 100) {
//         // Already packing, speak once
//         if (progress > 50 && progress < 60) {
//           const msg = voiceMessages.robotPacking[language as keyof typeof voiceMessages.robotPacking] || voiceMessages.robotPacking.en;
//           speak(msg, language);
//         }
//       }
      
//       if (progress >= 100) {
//         // Packing complete, move to payment
//         const msg = voiceMessages.packingComplete[language as keyof typeof voiceMessages.packingComplete] || voiceMessages.packingComplete.en;
//         const message = typeof msg === 'function' ? msg(total) : msg;
//         speak(message, language);
        
//         setTimeout(() => setStage('payment'), 2000);
//       }
//     }
//   }, [progress, stage, task?.status, language, total]);

//   // Handle payment complete
//   const handlePaymentComplete = () => {
//     setStage('delivery');
//     const msg = voiceMessages.deliveryStarting[language as keyof typeof voiceMessages.deliveryStarting] || voiceMessages.deliveryStarting.en;
//     speak(msg, language);
//   };

//   // Handle delivery complete
//   const handleDeliveryComplete = async () => {
//     // Speak thank you
//     const msg = voiceMessages.thankYou[language as keyof typeof voiceMessages.thankYou] || voiceMessages.thankYou.en;
//     speak(msg, language);
    
//     clearCart();
//     await endSession();
//     setCurrentOrder(null);
//     setStage('complete');
    
//     setTimeout(() => {
//       setStage('greeting');
//     }, 5000);
//   };

//   // Render based on stage
//   const renderStage = () => {
//     switch (stage) {
//       case 'greeting':
//         return <GreetingScreen onStart={handleStart} />;

//       case 'shopping':
//         return (
//           <div className="min-h-screen bg-background cyber-grid p-4 md:p-6">
//             {/* Header */}
//             <header className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-3">
//                 <Store className="w-8 h-8 text-primary" />
//                 <h1 className="text-2xl font-orbitron text-glow">AutoShop</h1>
//               </div>
//               <div className="flex items-center gap-4">
//                 <div className="flex items-center gap-2 text-primary">
//                   <Volume2 className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">Voice Active</span>
//                 </div>
//                 <div className="flex items-center gap-2 text-success">
//                   <Activity className="w-4 h-4 animate-pulse" />
//                   <span className="text-sm">System Ready</span>
//                 </div>
//               </div>
//             </header>

//             {/* Main layout */}
//             <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
//               {/* Products area */}
//               <div className="lg:col-span-2 space-y-4">
//                 {/* Input methods */}
//                 <div className="glass rounded-xl p-4">
//                   <div className="flex flex-wrap items-center justify-center gap-6">
//                     {/* Voice input */}
//                     <div className="flex flex-col items-center gap-2">
//                       <VoiceInput
//                         onVoiceResult={handleTextOrVoiceInput}
//                         isListening={isListening}
//                         setIsListening={setIsListening}
//                         language={language}
//                       />
//                       <span className="text-sm text-muted-foreground">
//                         {language === 'sw' ? 'Sema' : 'Speak'}
//                       </span>
//                     </div>

//                     {/* Divider */}
//                     <div className="hidden md:block h-16 w-px bg-border" />

//                     {/* Text input */}
//                     <div className="flex-1 min-w-[200px] max-w-md">
//                       <TextInput
//                         onSubmit={handleTextOrVoiceInput}
//                         placeholder={language === 'sw' ? 'Andika jina la bidhaa...' : 'Type product name...'}
//                       />
//                     </div>
//                   </div>
//                 </div>

//                 {/* Product display tabs */}
//                 <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'cards' | 'browse')} className="w-full">
//                   <TabsList className="grid w-full grid-cols-2">
//                     <TabsTrigger value="cards" className="text-lg">
//                       🎴 {language === 'sw' ? 'Kadi za Bidhaa' : 'Product Cards'}
//                     </TabsTrigger>
//                     <TabsTrigger value="browse" className="text-lg">
//                       📦 {language === 'sw' ? 'Vinjari' : 'Browse All'}
//                     </TabsTrigger>
//                   </TabsList>
                  
//                   <TabsContent value="cards" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <PhysicalCardBasket
//                         products={products}
//                         cart={cart}
//                         onSelectCard={handleCardSelect}
//                       />
//                     )}
//                   </TabsContent>
                  
//                   <TabsContent value="browse" className="mt-4">
//                     {productsLoading ? (
//                       <div className="text-center py-12">
//                         <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto" />
//                       </div>
//                     ) : (
//                       <ProductGrid
//                         products={products}
//                         cart={cart}
//                         onAddToCart={addToCart}
//                         onUpdateQuantity={updateQuantity}
//                       />
//                     )}
//                   </TabsContent>
//                 </Tabs>
//               </div>

//               {/* Cart panel */}
//               <div className="lg:col-span-1">
//                 <div className="sticky top-4">
//                   <CartPanel
//                     cart={cart}
//                     total={total}
//                     onUpdateQuantity={updateQuantity}
//                     onRemove={removeFromCart}
//                     onClear={clearCart}
//                     onCheckout={handleCheckout}
//                     language={language}
//                   />
//                 </div>
//               </div>
//             </div>
//           </div>
//         );

//       case 'packing':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-2xl">
//               <motion.h1
//                 initial={{ opacity: 0, y: -20 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 className="text-3xl font-orbitron text-center text-primary mb-8"
//               >
//                 {language === 'sw' ? 'Roboti Inafunga Bidhaa Zako' : 'Robot is Packing Your Order'}
//               </motion.h1>
//               <RobotAnimation
//                 status={task?.status || 'idle'}
//                 progress={progress}
//                 itemsTotal={cart.length}
//                 itemsPicked={task?.items_picked?.length || 0}
//                 itemsPacked={task?.items_packed?.length || 0}
//                 itemsList={task?.items_to_pick || []}
//               />
//             </div>
//           </div>
//         );

//       case 'payment':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-md">
//               {currentOrder && (
//                 <PaymentScreen
//                   order={currentOrder}
//                   onPaymentComplete={handlePaymentComplete}
//                   language={language}
//                 />
//               )}
//             </div>
//           </div>
//         );

//       case 'delivery':
//         return (
//           <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-6">
//             <div className="w-full max-w-lg">
//               {currentOrder && (
//                 <DeliveryScreen
//                   orderId={currentOrder.id}
//                   onComplete={handleDeliveryComplete}
//                   language={language}
//                 />
//               )}
//             </div>
//           </div>
//         );

//       case 'complete':
//         return (
//           <motion.div
//             initial={{ opacity: 0 }}
//             animate={{ opacity: 1 }}
//             className="min-h-screen bg-background cyber-grid flex flex-col items-center justify-center p-6"
//           >
//             <motion.div
//               initial={{ scale: 0 }}
//               animate={{ scale: 1 }}
//               transition={{ type: 'spring', bounce: 0.5 }}
//               className="text-8xl mb-8"
//             >
//               🎉
//             </motion.div>
//             <h1 className="text-4xl font-orbitron text-success text-center">
//               {language === 'sw' ? 'Asante Sana!' : language === 'fr' ? 'Merci Beaucoup!' : 'Thank You!'}
//             </h1>
//             <p className="text-xl text-muted-foreground mt-4">
//               {language === 'sw' ? 'Karibuni tena!' : language === 'fr' ? 'À bientôt!' : 'Visit us again!'}
//             </p>
//           </motion.div>
//         );

//       default:
//         return null;
//     }
//   };

//   return (
//     <AnimatePresence mode="wait">
//       <motion.div
//         key={stage}
//         initial={{ opacity: 0 }}
//         animate={{ opacity: 1 }}
//         exit={{ opacity: 0 }}
//       >
//         {renderStage()}
//       </motion.div>
//     </AnimatePresence>
//   );
// }
