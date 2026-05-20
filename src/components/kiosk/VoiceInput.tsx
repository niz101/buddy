import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';


interface VoiceInputProps {
  onVoiceResult: (text: string) => void;
  isListening: boolean;
  setIsListening: (listening: boolean) => void;
  language: string;
}

// Speech recognition setup
const SpeechRecognition = typeof window !== 'undefined' 
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition 
  : null;

export function VoiceInput({ onVoiceResult, isListening, setIsListening, language }: VoiceInputProps) {
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsSupported(!!SpeechRecognition);
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'sw' ? 'sw-KE' : language === 'fr' ? 'fr-FR' : 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
        setTranscript('');
      };
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }
        
        setTranscript(interimTranscript || finalTranscript);
        
        // Auto-process after final result with a short delay
        if (finalTranscript) {
          setIsProcessing(true);
          // Clear any existing timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          // Process after a brief pause
          timeoutRef.current = setTimeout(() => {
            onVoiceResult(finalTranscript);
            setTranscript('');
            setIsProcessing(false);
          }, 500);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setIsProcessing(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore stop errors
        }
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [language, setIsListening, onVoiceResult]);

  const toggleListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch {
        console.log('Recognition already started');
      }
    }
  }, [isListening, setIsListening]);

  if (!isSupported) {
    return (
      <div className="text-center text-muted-foreground">
        <MicOff className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Voice not supported</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Microphone button */}
      <motion.div
        animate={isListening ? { scale: [1, 1.05, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      >
        <Button
          size="lg"
          variant={isListening ? 'default' : 'outline'}
          className={`
            h-20 w-20 rounded-full relative
            ${isListening ? 'bg-primary glow-primary' : 'hover:glow-accent'}
            transition-all duration-300
          `}
          onClick={toggleListening}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : (
            <Mic className="w-10 h-10" />
          )}
        </Button>
      </motion.div>

      {/* Listening animation rings */}
      <AnimatePresence>
        {isListening && (
          <>
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-2 border-primary pointer-events-none"
            />
            <motion.div
              initial={{ scale: 1, opacity: 0.5 }}
              animate={{ scale: 2.5, opacity: 0 }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
              className="absolute inset-0 rounded-full border-2 border-primary pointer-events-none"
            />
          </>
        )}
      </AnimatePresence>

      {/* Status indicator */}
      {isListening && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 text-primary whitespace-nowrap"
        >
          <Volume2 className="w-3 h-3 animate-pulse" />
          <span className="text-xs">Listening...</span>
        </motion.div>
      )}

      {/* Transcript display */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-12 left-1/2 -translate-x-1/2 w-64 glass rounded-lg p-3 text-center z-10"
          >
            <p className="text-sm text-muted-foreground">I heard:</p>
            <p className="font-medium text-foreground">{transcript}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Re-export speak function for backwards compatibility
export { speak as speakText } from '@/lib/voiceGuidance';
