import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Package, DoorOpen, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { speak, voiceMessages } from '@/lib/voiceGuidance';
import { hardwareBridge } from '@/lib/hardwarebridge';

interface DeliveryScreenProps {
  orderId: string;
  onComplete: () => void;
  language: string;
}

export function DeliveryScreen({ orderId, onComplete, language }: DeliveryScreenProps) {
  const [stage, setStage] = useState<'conveyor' | 'ready' | 'collected'>('conveyor');
  const hasSpokenReady = useRef(false);

  useEffect(() => {
    // Send DELIVER command to Arduino (3 long blinks)
    hardwareBridge.deliver();
    
    // Simulate conveyor movement
    const timer1 = setTimeout(() => {
      setStage('ready');
      // Update order status
      supabase.from('orders').update({ 
        status: 'delivered',
        delivered_at: new Date().toISOString()
      }).eq('id', orderId);
      
      // Activate conveyor in shop status
      supabase.from('shop_status').update({ 
        conveyor_active: true 
      }).neq('id', '');
      
      // Speak collect message
      if (!hasSpokenReady.current) {
        hasSpokenReady.current = true;
        const msg = voiceMessages.collectGoods[language as keyof typeof voiceMessages.collectGoods] || voiceMessages.collectGoods.en;
        speak(msg, language);
      }
    }, 3000);

    return () => clearTimeout(timer1);
  }, [orderId, language]);

  const handleCollect = async () => {
    setStage('collected');
    
    // Send COLLECT command to Arduino (blinks for collected items)
    hardwareBridge.collect(1);
    // Stop conveyor
    hardwareBridge.conveyorStop();
    
    // Deactivate conveyor and unlock door
    await supabase.from('shop_status').update({ 
      conveyor_active: false,
      door_locked: false
    }).neq('id', '');

    setTimeout(onComplete, 2000);
  };

  const getText = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      conveyor: {
        en: 'Your items are being delivered...',
        sw: 'Bidhaa zako zinasafirishwa...',
        fr: 'Vos articles sont en cours de livraison...'
      },
      ready: {
        en: 'Your order is ready!',
        sw: 'Agizo lako liko tayari!',
        fr: 'Votre commande est prête!'
      },
      collect: {
        en: 'Collect from the window',
        sw: 'Chukua kutoka dirishani',
        fr: 'Récupérez à la fenêtre'
      },
      thankYou: {
        en: 'Thank you for shopping!',
        sw: 'Asante kwa kununua!',
        fr: 'Merci pour vos achats!'
      },
      doorUnlocking: {
        en: 'Door is unlocking...',
        sw: 'Mlango unafunguliwa...',
        fr: 'La porte se déverrouille...'
      },
      collected: {
        en: "I've Collected My Order",
        sw: 'Nimechukua Agizo Langu',
        fr: "J'ai Récupéré Ma Commande"
      }
    };
    return texts[key]?.[language] || texts[key]?.['en'] || key;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass rounded-xl p-8 text-center space-y-8"
    >
      {stage === 'conveyor' && (
        <>
          <motion.h2
            className="text-2xl font-orbitron text-primary"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            {getText('conveyor')}
          </motion.h2>

          {/* Conveyor animation */}
          <div className="relative h-32 bg-muted rounded-lg overflow-hidden">
            {/* Conveyor belt */}
            <div className="absolute bottom-0 inset-x-0 h-4 bg-border">
              <motion.div
                className="h-full w-full"
                style={{
                  backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--primary)) 0px, hsl(var(--primary)) 10px, transparent 10px, transparent 20px)'
                }}
                animate={{ x: [-20, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            {/* Package moving */}
            <motion.div
              className="absolute bottom-4"
              initial={{ left: '10%' }}
              animate={{ left: '80%' }}
              transition={{ duration: 3, ease: 'linear' }}
            >
              <Package className="w-16 h-16 text-primary" />
            </motion.div>

            {/* Exit window */}
            <div className="absolute right-4 bottom-4 top-4 w-16 border-2 border-dashed border-accent rounded flex items-center justify-center">
              <DoorOpen className="w-8 h-8 text-accent" />
            </div>
          </div>
        </>
      )}

      {stage === 'ready' && (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          >
            <Package className="w-24 h-24 text-success mx-auto glow-success" />
          </motion.div>

          <h2 className="text-3xl font-orbitron text-success">
            {getText('ready')}
          </h2>

          <p className="text-xl text-muted-foreground">
            {getText('collect')}
          </p>

          <motion.div
            className="flex items-center justify-center gap-4"
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Package className="w-8 h-8 text-primary" />
            <ArrowRight className="w-8 h-8 text-muted-foreground" />
            <DoorOpen className="w-8 h-8 text-accent" />
          </motion.div>

          <Button
            size="lg"
            className="h-16 px-12 text-xl font-orbitron glow-success"
            onClick={handleCollect}
          >
            {getText('collected')}
          </Button>
        </>
      )}

      {stage === 'collected' && (
        <>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.5 }}
          >
            <CheckCircle className="w-24 h-24 text-success mx-auto glow-success" />
          </motion.div>

          <h2 className="text-3xl font-orbitron text-success">
            {getText('thankYou')}
          </h2>

          <p className="text-xl text-muted-foreground">
            {getText('doorUnlocking')}
          </p>

          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.5, repeat: 3 }}
          >
            <DoorOpen className="w-16 h-16 text-accent mx-auto" />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
