import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Languages, Hand, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { speak, voiceMessages } from '@/lib/voiceGuidance';

interface GreetingScreenProps {
  onStart: (language: string) => void;
}

const languages = [
  { code: 'en', name: 'English', greeting: 'Welcome!' },
  { code: 'sw', name: 'Kiswahili', greeting: 'Karibu!' },
  { code: 'fr', name: 'Français', greeting: 'Bienvenue!' },
];

export function GreetingScreen({ onStart }: GreetingScreenProps) {
  const [showWave, setShowWave] = useState(true);
  const [hasSpoken, setHasSpoken] = useState(false);

  // Speak welcome message on mount
  useEffect(() => {
    if (!hasSpoken) {
      setHasSpoken(true);
      speak(voiceMessages.greeting.en, 'en');
    }
  }, [hasSpoken]);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowWave(prev => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ⭐ CHANGE: Selecting language immediately starts shopping
  const handleLanguageSelect = (langCode: string) => {
    const lang = languages.find(l => l.code === langCode);

    if (lang) {
      // Speak greeting in selected language
      speak(lang.greeting, langCode);

      // Speak start shopping message
      const message =
        voiceMessages.startShopping[langCode as keyof typeof voiceMessages.startShopping] ||
        voiceMessages.startShopping.en;

      speak(message, langCode);

      // 🚀 GO DIRECTLY TO SHOPPING
      onStart(langCode);
    }
  };

  return (
    <div className="min-h-screen bg-background cyber-grid relative overflow-hidden flex flex-col items-center justify-center p-8">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.3, 0.5] }}
          transition={{ duration: 5, repeat: Infinity }}
        />
      </div>

      {/* Speaker indicator */}
      <motion.div
        className="absolute top-6 right-6 flex items-center gap-2 text-primary"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Volume2 className="w-6 h-6" />
        <span className="text-sm font-exo">Voice Active</span>
      </motion.div>

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center space-y-8"
      >
        {/* Waving hand */}
        <motion.div
          animate={{ rotate: showWave ? [0, 20, -10, 20, 0] : 0 }}
          transition={{ duration: 0.8 }}
          className="inline-block"
        >
          <Hand className="w-24 h-24 text-primary mx-auto" />
        </motion.div>

        {/* Welcome text */}
        <motion.h1
          className="text-6xl md:text-8xl font-orbitron font-bold text-glow"
          animate={{ opacity: [1, 0.8, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="text-primary">WELCOME</span>
        </motion.h1>

        <p className="text-2xl text-muted-foreground font-exo">
          Select your language to begin
        </p>

        {/* Language selection */}
        <div className="flex flex-wrap justify-center gap-4 mt-8">
          {languages.map((lang, index) => (
            <motion.div
              key={lang.code}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Button
                variant="outline"
                size="lg"
                className="h-32 w-40 flex flex-col gap-2 text-lg font-semibold hover:glow-accent transition-all duration-300"
                onClick={() => handleLanguageSelect(lang.code)}
              >
                <Languages className="w-8 h-8" />
                <span>{lang.name}</span>
                <span className="text-sm opacity-70">{lang.greeting}</span>
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Voice hint */}
        <motion.p
          className="text-muted-foreground mt-8"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          💬 You can speak your order, type, or pick product cards
        </motion.p>
      </motion.div>
    </div>
  );
}



































// import { useEffect, useState } from 'react';
// import { motion } from 'framer-motion';
// import { Languages, Mic, Hand, Volume2 } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// interface GreetingScreenProps {
//   onStart: (language: string) => void;
// }

// const languages = [
//   { code: 'en', name: 'English', greeting: 'Welcome!' },
//   { code: 'sw', name: 'Kiswahili', greeting: 'Karibu!' },
//   { code: 'fr', name: 'Français', greeting: 'Bienvenue!' },
// ];

// export function GreetingScreen({ onStart }: GreetingScreenProps) {
//   const [selectedLang, setSelectedLang] = useState<string | null>(null);
//   const [showWave, setShowWave] = useState(true);
//   const [hasSpoken, setHasSpoken] = useState(false);

//   // Speak welcome message on mount
//   useEffect(() => {
//     if (!hasSpoken) {
//       setHasSpoken(true);
//       // Speak welcome in English first
//       speak(voiceMessages.greeting.en, 'en');
//     }
//   }, [hasSpoken]);

//   useEffect(() => {
//     const interval = setInterval(() => {
//       setShowWave(prev => !prev);
//     }, 2000);
//     return () => clearInterval(interval);
//   }, []);

//   // Speak greeting when language is selected
//   const handleLanguageSelect = (langCode: string) => {
//     setSelectedLang(langCode);
//     const lang = languages.find(l => l.code === langCode);
//     if (lang) {
//       speak(lang.greeting, langCode);
//     }
//   };

//   const handleStart = () => {
//     if (selectedLang) {
//       // Speak start shopping message
//       const message = voiceMessages.startShopping[selectedLang as keyof typeof voiceMessages.startShopping] || voiceMessages.startShopping.en;
//       speak(message, selectedLang);
//       onStart(selectedLang);
//     }
//   };

//   return (
//     <div className="min-h-screen bg-background cyber-grid relative overflow-hidden flex flex-col items-center justify-center p-8">
//       {/* Animated background elements */}
//       <div className="absolute inset-0 overflow-hidden pointer-events-none">
//         <motion.div
//           className="absolute top-20 left-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl"
//           animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
//           transition={{ duration: 4, repeat: Infinity }}
//         />
//         <motion.div
//           className="absolute bottom-20 right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl"
//           animate={{ scale: [1.2, 1, 1.2], opacity: [0.5, 0.3, 0.5] }}
//           transition={{ duration: 5, repeat: Infinity }}
//         />
//       </div>

//       {/* Speaker indicator */}
//       <motion.div
//         className="absolute top-6 right-6 flex items-center gap-2 text-primary"
//         animate={{ opacity: [0.5, 1, 0.5] }}
//         transition={{ duration: 2, repeat: Infinity }}
//       >
//         <Volume2 className="w-6 h-6" />
//         <span className="text-sm font-exo">Voice Active</span>
//       </motion.div>

//       {/* Main content */}
//       <motion.div
//         initial={{ opacity: 0, y: 20 }}
//         animate={{ opacity: 1, y: 0 }}
//         className="relative z-10 text-center space-y-8"
//       >
//         {/* Waving hand */}
//         <motion.div
//           animate={{ rotate: showWave ? [0, 20, -10, 20, 0] : 0 }}
//           transition={{ duration: 0.8 }}
//           className="inline-block"
//         >
//           <Hand className="w-24 h-24 text-primary mx-auto" />
//         </motion.div>

//         {/* Welcome text */}
//         <motion.h1
//           className="text-6xl md:text-8xl font-orbitron font-bold text-glow"
//           animate={{ opacity: [1, 0.8, 1] }}
//           transition={{ duration: 2, repeat: Infinity }}
//         >
//           <span className="text-primary">WELCOME</span>
//         </motion.h1>

//         <p className="text-2xl text-muted-foreground font-exo">
//           Select your language to begin
//         </p>

//         {/* Language selection */}
//         <div className="flex flex-wrap justify-center gap-4 mt-8">
//           {languages.map((lang, index) => (
//             <motion.div
//               key={lang.code}
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ delay: index * 0.1 }}
//             >
//               <Button
//                 variant={selectedLang === lang.code ? 'default' : 'outline'}
//                 size="lg"
//                 className={`
//                   h-32 w-40 flex flex-col gap-2 text-lg font-semibold
//                   ${selectedLang === lang.code ? 'glow-primary' : 'hover:glow-accent'}
//                   transition-all duration-300
//                 `}
//                 onClick={() => handleLanguageSelect(lang.code)}
//               >
//                 <Languages className="w-8 h-8" />
//                 <span>{lang.name}</span>
//                 <span className="text-sm opacity-70">{lang.greeting}</span>
//               </Button>
//             </motion.div>
//           ))}
//         </div>

//         {/* Start button */}
//         {selectedLang && (
//           <motion.div
//             initial={{ opacity: 0, scale: 0.9 }}
//             animate={{ opacity: 1, scale: 1 }}
//             className="pt-8"
//           >
//             <Button
//               size="lg"
//               className="h-20 px-16 text-2xl font-orbitron glow-primary hover:scale-105 transition-transform"
//               onClick={handleStart}
//             >
//               <Mic className="w-8 h-8 mr-4" />
//               START SHOPPING
//             </Button>
//           </motion.div>
//         )}

//         {/* Voice hint */}
//         <motion.p
//           className="text-muted-foreground mt-8"
//           animate={{ opacity: [0.5, 1, 0.5] }}
//           transition={{ duration: 2, repeat: Infinity }}
//         >
//           💬 You can speak your order, type, or pick product cards
//         </motion.p>
//       </motion.div>
//     </div>
//   );
// }
