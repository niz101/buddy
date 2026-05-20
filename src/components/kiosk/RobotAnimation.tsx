import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Package, CheckCircle, Loader2, ScanLine, ArrowRight, Box, Grip } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { RobotStatus, ItemToPick } from '@/types/shop';

interface RobotAnimationProps {
  status: RobotStatus;
  progress: number;
  itemsTotal: number;
  itemsPicked: number;
  itemsPacked: number;
  itemsList?: ItemToPick[];
}

type SimStage = 'scanning' | 'locating' | 'picking' | 'transporting' | 'packing' | 'sealing' | 'done';

const stageLabels: Record<SimStage, string> = {
  scanning: '🔍 Scanning product cards...',
  locating: '📍 Locating items on shelves...',
  picking: '🤖 Robot arm picking items...',
  transporting: '🏗️ Transporting to packing station...',
  packing: '📦 Packing items into bag...',
  sealing: '✅ Sealing package...',
  done: '🎉 Order ready for delivery!',
};

export function RobotAnimation({ 
  status, 
  progress, 
  itemsTotal, 
  itemsPicked, 
  itemsPacked,
  itemsList = []
}: RobotAnimationProps) {
  const [simStage, setSimStage] = useState<SimStage>('scanning');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Derive simulation stage from progress and status
  useEffect(() => {
    if (progress < 10) {
      setSimStage('scanning');
    } else if (progress < 25) {
      setSimStage('locating');
    } else if (progress < 50) {
      setSimStage('picking');
    } else if (progress < 60) {
      setSimStage('transporting');
    } else if (progress < 90) {
      setSimStage('packing');
    } else if (progress < 100) {
      setSimStage('sealing');
    } else {
      setSimStage('done');
    }
  }, [progress]);

  // Animate current item index
  useEffect(() => {
    if (itemsList.length > 0) {
      setCurrentItemIndex(Math.min(itemsPicked, itemsList.length - 1));
    }
  }, [itemsPicked, itemsList]);

  // Build live log
  useEffect(() => {
    const logs: string[] = [];
    if (progress >= 5) logs.push('✓ Cards received from basket');
    if (progress >= 10) logs.push('✓ Product codes verified');
    itemsList.forEach((item, i) => {
      if (i < itemsPicked) {
        logs.push(`✓ Picked: ${item.product_name} (Shelf ${item.shelf_location})`);
      }
    });
    if (progress >= 55) logs.push('✓ Items transported to packing');
    itemsList.forEach((item, i) => {
      if (i < itemsPacked) {
        logs.push(`✓ Packed: ${item.product_name}`);
      }
    });
    if (progress >= 95) logs.push('✓ Package sealed');
    if (progress >= 100) logs.push('✓ Ready for delivery via conveyor');
    setLogMessages(logs);
  }, [progress, itemsPicked, itemsPacked, itemsList]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass rounded-xl p-6 space-y-6"
    >
      {/* Current stage visualization */}
      <div className="relative h-56 bg-muted/50 rounded-lg overflow-hidden border border-border">
        {/* Stage-specific animations */}
        <AnimatePresence mode="wait">
          <motion.div
            key={simStage}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {simStage === 'scanning' && (
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{ rotateY: [0, 360] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <ScanLine className="w-16 h-16 text-primary" />
                </motion.div>
                <div className="flex gap-2">
                  {itemsList.slice(0, 4).map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.3 }}
                      className="bg-card border border-primary/50 rounded-lg px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-primary">{item.product_name}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {simStage === 'locating' && (
              <div className="w-full px-8">
                {/* Shelf grid */}
                <div className="grid grid-cols-5 gap-2">
                  {['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1'].map((loc, i) => {
                    const isTarget = itemsList.some(item => item.shelf_location === loc);
                    return (
                      <motion.div
                        key={loc}
                        className={`h-10 rounded flex items-center justify-center text-xs font-mono ${
                          isTarget ? 'bg-primary/30 border border-primary text-primary' : 'bg-muted border border-border text-muted-foreground'
                        }`}
                        animate={isTarget ? { 
                          boxShadow: ['0 0 0px hsl(var(--primary))', '0 0 15px hsl(var(--primary))', '0 0 0px hsl(var(--primary))']
                        } : {}}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        {loc}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {simStage === 'picking' && (
              <div className="relative w-full h-full">
                {/* Shelves */}
                <div className="absolute top-4 inset-x-8 grid grid-cols-4 gap-2">
                  {itemsList.map((item, i) => (
                    <motion.div
                      key={i}
                      className={`h-12 rounded flex flex-col items-center justify-center text-[10px] border ${
                        i < itemsPicked 
                          ? 'bg-success/20 border-success text-success' 
                          : i === currentItemIndex 
                            ? 'bg-primary/20 border-primary text-primary animate-pulse' 
                            : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      <Package className="w-4 h-4" />
                      <span className="truncate max-w-full px-1">{item.product_name}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Robot arm */}
                <motion.div
                  className="absolute bottom-8 left-1/2"
                  animate={{
                    x: itemsList.length > 0 ? [0, -80, 80, -40, 40, 0] : [0],
                    y: [0, -30, 0, -30, 0]
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <div className="flex flex-col items-center">
                    <div className="w-1 h-12 bg-primary" />
                    <Bot className="w-10 h-10 text-primary" />
                  </div>
                </motion.div>
              </div>
            )}

            {simStage === 'transporting' && (
              <div className="relative w-full h-full flex items-end">
                {/* Conveyor belt */}
                <div className="absolute bottom-0 inset-x-0 h-6 bg-border">
                  <motion.div
                    className="h-full"
                    style={{
                      backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--primary) / 0.3) 0px, hsl(var(--primary) / 0.3) 10px, transparent 10px, transparent 20px)'
                    }}
                    animate={{ x: [-20, 0] }}
                    transition={{ duration: 0.3, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
                
                {/* Items moving on belt */}
                <motion.div
                  className="absolute bottom-6 flex gap-3"
                  initial={{ left: '5%' }}
                  animate={{ left: '70%' }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Box className="w-10 h-10 text-primary" />
                  <Package className="w-10 h-10 text-accent" />
                </motion.div>

                {/* Packing station */}
                <div className="absolute right-4 bottom-6 w-16 h-20 border-2 border-dashed border-accent rounded flex items-center justify-center">
                  <Grip className="w-8 h-8 text-accent" />
                </div>
              </div>
            )}

            {simStage === 'packing' && (
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Box className="w-20 h-20 text-accent" />
                </motion.div>
                <div className="flex gap-1">
                  {itemsList.map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{ y: -20, opacity: 0 }}
                      animate={i < itemsPacked ? { y: 0, opacity: 1 } : { y: -20, opacity: 0.3 }}
                      className="w-6 h-6 rounded bg-primary/50 flex items-center justify-center"
                    >
                      <Package className="w-4 h-4 text-primary-foreground" />
                    </motion.div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {itemsPacked}/{itemsTotal} items packed
                </p>
              </div>
            )}

            {simStage === 'sealing' && (
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={{ scale: [1, 0.95, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  <Box className="w-24 h-24 text-success" />
                </motion.div>
                <motion.div
                  className="h-1 bg-success rounded"
                  initial={{ width: 0 }}
                  animate={{ width: 120 }}
                  transition={{ duration: 2 }}
                />
                <p className="text-success font-orbitron">Sealing package...</p>
              </div>
            )}

            {simStage === 'done' && (
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.6 }}
                >
                  <CheckCircle className="w-24 h-24 text-success" />
                </motion.div>
                <p className="text-2xl font-orbitron text-success">Order Ready!</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Stage label overlay */}
        <div className="absolute top-2 left-2 right-2">
          <div className="bg-background/80 backdrop-blur rounded-lg px-3 py-1.5 text-sm font-medium text-primary">
            {stageLabels[simStage]}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={progress} className="h-4" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Items picked: {itemsPicked}/{itemsTotal}</span>
          <span>Items packed: {itemsPacked}/{itemsTotal}</span>
        </div>
      </div>

      {/* Live operation log */}
      <div className="bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto border border-border">
        <p className="text-xs font-mono text-muted-foreground mb-2">📋 OPERATION LOG</p>
        <div className="space-y-1">
          {logMessages.map((msg, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="text-xs font-mono text-foreground"
            >
              {msg}
            </motion.p>
          ))}
          {progress < 100 && (
            <motion.p
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-xs font-mono text-primary"
            >
              <Loader2 className="w-3 h-3 inline animate-spin mr-1" />
              Processing...
            </motion.p>
          )}
        </div>
      </div>

      {/* Stage indicators */}
      <div className="flex justify-between">
        {[
          { label: 'Scan', stages: ['scanning'] as SimStage[] },
          { label: 'Pick', stages: ['locating', 'picking'] as SimStage[] },
          { label: 'Pack', stages: ['transporting', 'packing', 'sealing'] as SimStage[] },
          { label: 'Ready', stages: ['done'] as SimStage[] },
        ].map((step, index) => {
          const isActive = step.stages.includes(simStage);
          const stageOrder = ['scanning', 'locating', 'picking', 'transporting', 'packing', 'sealing', 'done'];
          const currentIdx = stageOrder.indexOf(simStage);
          const stepFirstIdx = stageOrder.indexOf(step.stages[0]);
          const isComplete = currentIdx > stageOrder.indexOf(step.stages[step.stages.length - 1]);

          return (
            <div
              key={step.label}
              className={`flex flex-col items-center gap-1 ${
                isActive ? 'text-primary' : isComplete ? 'text-success' : 'text-muted-foreground'
              }`}
            >
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                ${isActive ? 'bg-primary text-primary-foreground glow-primary' : 
                  isComplete ? 'bg-success text-success-foreground' : 'bg-muted'}
              `}>
                {isComplete ? <CheckCircle className="w-5 h-5" /> : index + 1}
              </div>
              <span className="text-sm">{step.label}</span>
              {index < 3 && (
                <ArrowRight className="w-3 h-3 text-muted-foreground absolute" style={{ display: 'none' }} />
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}