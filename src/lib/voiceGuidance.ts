// Voice Guidance System using Web Speech API
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

interface VoiceConfig {
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
}

const languageConfigs: Record<string, VoiceConfig> = {
  en: { lang: 'en-US', rate: 0.9, pitch: 1, volume: 1 },
  sw: { lang: 'sw-KE', rate: 0.85, pitch: 1, volume: 1 },
  fr: { lang: 'fr-FR', rate: 0.9, pitch: 1, volume: 1 },
};

// Preload voices
let voices: SpeechSynthesisVoice[] = [];
if (synth) {
  voices = synth.getVoices();
  synth.onvoiceschanged = () => {
    voices = synth.getVoices();
  };
}

export function speak(text: string, language: string = 'en'): Promise<void> {
  return new Promise((resolve, _reject) => {
    if (!synth) {
      console.warn('Speech synthesis not supported');
      resolve();
      return;
    }

    // Cancel any ongoing speech
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const config = languageConfigs[language] || languageConfigs.en;
    
    utterance.lang = config.lang;
    utterance.rate = config.rate;
    utterance.pitch = config.pitch;
    utterance.volume = config.volume;

    // Try to find a voice for the language
    const voice = voices.find(v => v.lang.startsWith(language) || v.lang.startsWith(config.lang.split('-')[0]));
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      resolve(); // Don't reject, just continue
    };

    synth.speak(utterance);
  });
}

export function stopSpeaking() {
  if (synth) {
    synth.cancel();
  }
}

// Voice guidance messages in multiple languages
export const voiceMessages = {
  greeting: {
    en: "Welcome to AutoShop! Please select your language to begin shopping.",
    sw: "Karibu AutoShop! Tafadhali chagua lugha yako kuanza ununuzi.",
    fr: "Bienvenue chez AutoShop! Veuillez sélectionner votre langue pour commencer."
  },
  startShopping: {
    en: "Great choice! You can now shop by speaking, typing, or picking product cards. Just tell me what you need!",
    sw: "Chaguo zuri! Sasa unaweza kununua kwa kusema, kuandika, au kuchagua kadi za bidhaa. Niambie unachohitaji!",
    fr: "Excellent choix! Vous pouvez maintenant acheter en parlant, en tapant ou en choisissant des cartes produits."
  },
  itemAdded: {
    en: (name: string, qty: number) => `Added ${qty} ${name} to your cart.`,
    sw: (name: string, qty: number) => `Nimeongeza ${name} ${qty} kwenye kikapu chako.`,
    fr: (name: string, qty: number) => `J'ai ajouté ${qty} ${name} à votre panier.`
  },
  itemRemoved: {
    en: (name: string) => `Removed ${name} from your cart.`,
    sw: (name: string) => `Nimeondoa ${name} kutoka kwenye kikapu chako.`,
    fr: (name: string) => `J'ai retiré ${name} de votre panier.`
  },
  cartTotal: {
    en: (total: number, count: number) => `Your cart has ${count} items totaling ${total} shillings.`,
    sw: (total: number, count: number) => `Kikapu chako kina vitu ${count} vya jumla ya shilingi ${total}.`,
    fr: (total: number, count: number) => `Votre panier contient ${count} articles pour un total de ${total} shillings.`
  },
  checkoutStarting: {
    en: "Excellent! I'm now sending your order to our robot. Please wait while we prepare your items.",
    sw: "Vizuri sana! Sasa ninatuma oda yako kwa roboti yetu. Tafadhali subiri tunapoandaa vitu vyako.",
    fr: "Excellent! J'envoie maintenant votre commande à notre robot. Veuillez patienter pendant que nous préparons vos articles."
  },
  robotPicking: {
    en: "Our robot is now picking your items from the shelves. You can watch the progress on screen.",
    sw: "Roboti yetu sasa inachukua vitu vyako kutoka kwenye rafu. Unaweza kuangalia maendeleo kwenye skrini.",
    fr: "Notre robot récupère maintenant vos articles dans les rayons. Vous pouvez suivre la progression à l'écran."
  },
  robotPacking: {
    en: "Your items are being packed carefully. Almost ready!",
    sw: "Vitu vyako vinafungwa kwa uangalifu. Karibu kumaliza!",
    fr: "Vos articles sont soigneusement emballés. Presque prêt!"
  },
  packingComplete: {
    en: (total: number) => `Packing complete! Your total is ${total} shillings. Please proceed to payment.`,
    sw: (total: number) => `Ufungaji umekamilika! Jumla yako ni shilingi ${total}. Tafadhali endelea na malipo.`,
    fr: (total: number) => `Emballage terminé! Votre total est de ${total} shillings. Veuillez procéder au paiement.`
  },
  paymentPrompt: {
    en: "Please select your payment method. You can pay with M-Pesa or cash.",
    sw: "Tafadhali chagua njia yako ya malipo. Unaweza kulipa na M-Pesa au pesa taslimu.",
    fr: "Veuillez sélectionner votre mode de paiement. Vous pouvez payer par M-Pesa ou en espèces."
  },
  mpesaPrompt: {
    en: "Please enter your M-Pesa phone number. You will receive a payment prompt on your phone.",
    sw: "Tafadhali ingiza nambari yako ya M-Pesa. Utapokea ujumbe wa malipo kwenye simu yako.",
    fr: "Veuillez entrer votre numéro M-Pesa. Vous recevrez une invite de paiement sur votre téléphone."
  },
  mpesaWaiting: {
    en: "Check your phone for the M-Pesa prompt. Enter your PIN to complete payment.",
    sw: "Angalia simu yako kwa ujumbe wa M-Pesa. Ingiza PIN yako kukamilisha malipo.",
    fr: "Vérifiez votre téléphone pour l'invite M-Pesa. Entrez votre PIN pour finaliser le paiement."
  },
  cashPayment: {
    en: "Please insert your cash into the payment slot.",
    sw: "Tafadhali weka pesa yako kwenye kisanduku cha malipo.",
    fr: "Veuillez insérer votre argent dans la fente de paiement."
  },
  paymentSuccess: {
    en: "Payment successful! Thank you. Your goods are now being delivered to the collection window.",
    sw: "Malipo yamefanikiwa! Asante. Bidhaa zako sasa zinasafirishwa hadi dirisha la ukusanyaji.",
    fr: "Paiement réussi! Merci. Vos marchandises sont maintenant livrées à la fenêtre de collecte."
  },
  deliveryStarting: {
    en: "The conveyor is now moving your packed items to the collection window. Please wait.",
    sw: "Conveyor sasa inasafirisha vitu vyako vilivyofungwa hadi dirisha la ukusanyaji. Tafadhali subiri.",
    fr: "Le convoyeur transporte maintenant vos articles emballés vers la fenêtre de collecte. Veuillez patienter."
  },
  collectGoods: {
    en: "Your order is ready! Please collect your items from the window. Thank you for shopping with us!",
    sw: "Oda yako iko tayari! Tafadhali chukua vitu vyako kutoka dirishani. Asante kwa kununua nasi!",
    fr: "Votre commande est prête! Veuillez récupérer vos articles à la fenêtre. Merci de votre achat!"
  },
  thankYou: {
    en: "Thank you for shopping at AutoShop! We hope to see you again soon. Goodbye!",
    sw: "Asante kwa kununua AutoShop! Tunatumai kukuona tena hivi karibuni. Kwaheri!",
    fr: "Merci d'avoir fait vos achats chez AutoShop! Nous espérons vous revoir bientôt. Au revoir!"
  },
  noMatch: {
    en: "I couldn't find that product. Please try again or pick a product card.",
    sw: "Sikuweza kupata bidhaa hiyo. Tafadhali jaribu tena au chagua kadi ya bidhaa.",
    fr: "Je n'ai pas trouvé ce produit. Veuillez réessayer ou choisir une carte produit."
  },
  outOfStock: {
    en: (name: string) => `Sorry, ${name} is currently out of stock.`,
    sw: (name: string) => `Samahani, ${name} haipo kwa sasa.`,
    fr: (name: string) => `Désolé, ${name} est actuellement en rupture de stock.`
  }
};

export function getVoiceMessage<K extends keyof typeof voiceMessages>(
  key: K, 
  language: string, 
  ...args: Parameters<Extract<typeof voiceMessages[K][keyof typeof voiceMessages[K]], (...args: any[]) => string>> extends never 
    ? [] 
    : Parameters<Extract<typeof voiceMessages[K][keyof typeof voiceMessages[K]], (...args: any[]) => string>>
): string {
  const messages = voiceMessages[key];
  const message = messages[language as keyof typeof messages] || messages.en;
  
  if (typeof message === 'function') {
    return (message as (...args: any[]) => string)(...args);
  }
  return message as string;
}

export async function speakMessage<K extends keyof typeof voiceMessages>(
  key: K, 
  language: string, 
  ...args: Parameters<Extract<typeof voiceMessages[K][keyof typeof voiceMessages[K]], (...args: any[]) => string>> extends never 
    ? [] 
    : Parameters<Extract<typeof voiceMessages[K][keyof typeof voiceMessages[K]], (...args: any[]) => string>>
): Promise<void> {
  const message = getVoiceMessage(key, language, ...args);
  await speak(message, language);
}
