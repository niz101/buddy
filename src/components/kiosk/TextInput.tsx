import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Keyboard, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TextInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  isProcessing?: boolean;
}

export function TextInput({ onSubmit, placeholder = "Type your order...", isProcessing = false }: TextInputProps) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Clear feedback after a delay
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !isProcessing) {
      onSubmit(text.trim());
      setText('');
    }
  };

  // Auto-submit on Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <div className="relative flex-1">
          <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="pl-10 h-14 text-lg bg-muted border-border focus:border-primary focus:glow-primary"
            disabled={isProcessing}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-14 px-6"
          disabled={!text.trim() || isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </form>
      
      {/* Feedback message */}
      {feedback && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm text-center text-muted-foreground"
        >
          {feedback}
        </motion.p>
      )}
      
      {/* Hint text */}
      <p className="text-xs text-center text-muted-foreground">
        Type product name and press Enter to add
      </p>
    </motion.div>
  );
}
