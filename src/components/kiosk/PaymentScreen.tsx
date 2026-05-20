import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Phone, CheckCircle, Loader2, Banknote, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Order, PaymentMethod } from '@/types/shop';
import { speak, voiceMessages } from '@/lib/voiceGuidance';

interface PaymentScreenProps {
  order: Order;
  onPaymentComplete: () => void;
  language: string;
  onBack: () => void;
}

export function PaymentScreen({ order, onPaymentComplete, language, onBack }: PaymentScreenProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasSpokenPrompt = useRef(false);

  // ======== Speak payment prompt ========
  useEffect(() => {
    if (!hasSpokenPrompt.current) {
      hasSpokenPrompt.current = true;
      const message =
        voiceMessages.paymentPrompt[language as keyof typeof voiceMessages.paymentPrompt] ||
        voiceMessages.paymentPrompt.en;
      speak(message, language);
    }
  }, [language]);

  // ======== REAL M-PESA PAYMENT ========
  const handleMpesaPayment = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);

    const mpesaMessage =
      voiceMessages.mpesaWaiting[language as keyof typeof voiceMessages.mpesaWaiting] ||
      voiceMessages.mpesaWaiting.en;
    speak(mpesaMessage, language);

    try {
      // Convert to Safaricom format 2547XXXXXXXX
      const formattedPhone = phoneNumber.startsWith('0')
        ? '254' + phoneNumber.substring(1)
        : phoneNumber;

      const response = await fetch('http://localhost:4000/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: order.total_amount,
          phone: formattedPhone
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Payment request failed');

      // ===== SUCCESS TRIGGERED =====
      // STK push sent to phone
      // We wait a bit for user approval

      setTimeout(handlePaymentSuccess, 8000);

    } catch (error: any) {
      console.error('M-Pesa payment error:', error);
      setStatus('failed');
      setErrorMessage(error.message || 'Payment failed. Please try again.');
    }
  };

  // ======== PAYMENT SUCCESS ========
  const handlePaymentSuccess = () => {
    setStatus('success');

    const successMessage =
      voiceMessages.paymentSuccess[language as keyof typeof voiceMessages.paymentSuccess] ||
      voiceMessages.paymentSuccess.en;
    speak(successMessage, language);

    // Update order in Supabase
    supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_method: 'mpesa',
        payment_verified: true
      })
      .eq('id', order.id);

    setTimeout(onPaymentComplete, 2500);
  };

  // ======== CASH PAYMENT ========
  const handleCashPayment = async () => {
    setStatus('processing');

    const cashMessage =
      voiceMessages.cashPayment[language as keyof typeof voiceMessages.cashPayment] ||
      voiceMessages.cashPayment.en;
    speak(cashMessage, language);

    await supabase.from('payments').insert({
      order_id: order.id,
      method: 'cash',
      amount: order.total_amount,
      status: 'completed',
      verified: true
    });

    await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_method: 'cash',
        payment_verified: true
      })
      .eq('id', order.id);

    handlePaymentSuccess();
  };

  const handleMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);

    if (method === 'mpesa') {
      const msg =
        voiceMessages.mpesaPrompt[language as keyof typeof voiceMessages.mpesaPrompt] ||
        voiceMessages.mpesaPrompt.en;
      speak(msg, language);
    }
  };

  // ======== SUCCESS UI ========
  if (status === 'success') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-8 text-center space-y-6">
        <CheckCircle className="w-24 h-24 text-success mx-auto glow-success" />
        <h2 className="text-3xl font-orbitron text-success">Payment Successful!</h2>
        <p className="text-xl">KES {order.total_amount.toLocaleString()}</p>
      </motion.div>
    );
  }

  // ======== FAILED UI ========
  if (status === 'failed') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-8 text-center space-y-6">
        <XCircle className="w-20 h-20 text-destructive mx-auto" />
        <h2 className="text-2xl font-orbitron text-destructive">Payment Failed</h2>
        {errorMessage && <p>{errorMessage}</p>}
        <Button onClick={() => setStatus('idle')}>Try Again</Button>
      </motion.div>
    );
  }

  // ======== MAIN UI ========
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-6 space-y-6">
      <h2 className="text-2xl font-orbitron text-primary text-center">Payment</h2>

      <div className="text-center bg-muted/50 rounded-lg p-4">
        <p>Total Amount</p>
        <p className="text-4xl font-orbitron text-primary">
          KES {order.total_amount.toLocaleString()}
        </p>
      </div>

      {!paymentMethod && status === 'idle' && (
        <div className="grid grid-cols-2 gap-4">
          <Button onClick={() => handleMethodSelect('mpesa')} className="h-32 flex-col">
            <Phone className="w-12 h-12" />
            Pay with M-Pesa
          </Button>

          <Button onClick={() => handleMethodSelect('cash')} className="h-32 flex-col">
            <Banknote className="w-12 h-12" />
            Pay with Cash
          </Button>

          <Button onClick={onBack} className="col-span-2">
            <ArrowLeft /> Go Back
          </Button>
        </div>
      )}

      {paymentMethod === 'mpesa' && status === 'idle' && (
        <div className="space-y-4">
          <Input
            type="tel"
            placeholder="0712345678"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
            className="text-2xl text-center h-14"
            maxLength={10}
          />

          <Button onClick={handleMpesaPayment} className="w-full h-14 text-xl">
            Confirm M-Pesa Payment
          </Button>

          <Button variant="ghost" onClick={() => setPaymentMethod(null)}>
            Back
          </Button>
        </div>
      )}

      {status === 'processing' && (
        <div className="text-center space-y-4">
          <Loader2 className="w-16 h-16 mx-auto animate-spin" />
          <p>Check your phone for M-Pesa prompt</p>
        </div>
      )}
    </motion.div>
  );
}











































// super cool only uses simulated mpesa prompting 
// import { useState, useEffect, useRef } from 'react';
// import { motion } from 'framer-motion';
// import { Phone, CheckCircle, Loader2, Banknote, XCircle, ArrowLeft } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { supabase } from '@/integrations/supabase/client';
// import { Order, PaymentMethod } from '@/types/shop';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// interface PaymentScreenProps {
//   order: Order;
//   onPaymentComplete: () => void;
//   language: string;
//   onBack: () => void; // Callback for "Go Back"
// }

// export function PaymentScreen({ order, onPaymentComplete, language, onBack }: PaymentScreenProps) {
//   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
//   const [phoneNumber, setPhoneNumber] = useState('');
//   const [status, setStatus] = useState<'idle' | 'processing' | 'polling' | 'success' | 'failed'>('idle');
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [_checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
//   const pollingRef = useRef<NodeJS.Timeout | null>(null);
//   const hasSpokenPrompt = useRef(false);

//   // Speak payment prompt on mount
//   useEffect(() => {
//     if (!hasSpokenPrompt.current) {
//       hasSpokenPrompt.current = true;
//       const message = voiceMessages.paymentPrompt[language as keyof typeof voiceMessages.paymentPrompt] || voiceMessages.paymentPrompt.en;
//       speak(message, language);
//     }
//   }, [language]);

//   // Cleanup polling on unmount
//   useEffect(() => {
//     return () => {
//       if (pollingRef.current) clearInterval(pollingRef.current);
//     };
//   }, []);

//   // ======== Payment Handlers ========

//   const handleMpesaPayment = async () => {
//     if (!phoneNumber || phoneNumber.length < 10) {
//       setErrorMessage('Please enter a valid phone number');
//       return;
//     }

//     setStatus('processing');
//     setErrorMessage(null);

//     const mpesaMessage = voiceMessages.mpesaWaiting[language as keyof typeof voiceMessages.mpesaWaiting] || voiceMessages.mpesaWaiting.en;
//     speak(mpesaMessage, language);

//     try {
//       const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
//         body: {
//           phone_number: phoneNumber,
//           amount: order.total_amount,
//           order_id: order.id,
//           account_reference: `ORDER-${order.id.substring(0, 8)}`,
//           description: 'AutoShop Payment'
//         }
//       });

//       if (error) throw new Error(error.message || 'Failed to initiate payment');
//       if (!data.success) throw new Error(data.error || 'Failed to send STK Push');

//       setCheckoutRequestId(data.checkout_request_id);
//       setStatus('polling');
//       startPolling(data.checkout_request_id);
//     } catch (error: any) {
//       console.error('M-Pesa payment error:', error);
//       setStatus('failed');
//       setErrorMessage(error.message || 'Payment failed. Please try again.');

//       // Demo fallback
//       setTimeout(simulateMpesaPayment, 2000);
//     }
//   };

//   const simulateMpesaPayment = async () => {
//     setStatus('processing');
//     setErrorMessage(null);

//     speak("Simulating payment for demo. Please wait.", language);

//     const { data: payment } = await supabase
//       .from('payments')
//       .insert({
//         order_id: order.id,
//         method: 'mpesa',
//         amount: order.total_amount,
//         phone_number: phoneNumber,
//         status: 'pending',
//         mpesa_checkout_request_id: `SIM_${Date.now()}`
//       })
//       .select()
//       .single();

//     await new Promise(r => setTimeout(r, 3000));

//     if (payment) {
//       await supabase
//         .from('payments')
//         .update({ 
//           status: 'completed', 
//           verified: true,
//           mpesa_receipt: `MPESA${Date.now()}`,
//           verified_at: new Date().toISOString()
//         })
//         .eq('id', payment.id);

//       await supabase
//         .from('orders')
//         .update({ 
//           status: 'paid',
//           payment_method: 'mpesa',
//           payment_reference: `MPESA${Date.now()}`,
//           payment_verified: true
//         })
//         .eq('id', order.id);
//     }

//     handlePaymentSuccess();
//   };

//   const startPolling = (requestId: string) => {
//     let pollCount = 0;
//     const maxPolls = 24; // 2 minutes max (5s intervals)

//     pollingRef.current = setInterval(async () => {
//       pollCount++;
//       if (pollCount > maxPolls) {
//         if (pollingRef.current) clearInterval(pollingRef.current);
//         setStatus('failed');
//         setErrorMessage('Payment timeout. Please try again.');
//         return;
//       }

//       try {
//         const { data } = await supabase.functions.invoke('mpesa-query', {
//           body: { checkout_request_id: requestId }
//         });

//         if (data?.status === 'completed') {
//           if (pollingRef.current) clearInterval(pollingRef.current);
//           handlePaymentSuccess();
//         } else if (data?.status === 'failed') {
//           if (pollingRef.current) clearInterval(pollingRef.current);
//           setStatus('failed');
//           setErrorMessage(data.result_desc || 'Payment was cancelled or failed');
//         }
//       } catch (error) {
//         console.error('Polling error:', error);
//       }
//     }, 5000);
//   };

//   const handlePaymentSuccess = () => {
//     setStatus('success');
//     const successMessage = voiceMessages.paymentSuccess[language as keyof typeof voiceMessages.paymentSuccess] || voiceMessages.paymentSuccess.en;
//     speak(successMessage, language);

//     supabase.functions.invoke('send-purchase-email', { body: { order_id: order.id } })
//       .catch(err => console.error('Email notification error:', err));

//     setTimeout(onPaymentComplete, 2500);
//   };

//   const handleCashPayment = async () => {
//     setStatus('processing');

//     const cashMessage = voiceMessages.cashPayment[language as keyof typeof voiceMessages.cashPayment] || voiceMessages.cashPayment.en;
//     speak(cashMessage, language);

//     await supabase
//       .from('payments')
//       .insert({
//         order_id: order.id,
//         method: 'cash',
//         amount: order.total_amount,
//         status: 'completed',
//         verified: true
//       });

//     await supabase
//       .from('orders')
//       .update({ 
//         status: 'paid',
//         payment_method: 'cash',
//         payment_verified: true
//       })
//       .eq('id', order.id);

//     handlePaymentSuccess();
//   };

//   const handleMethodSelect = (method: PaymentMethod) => {
//     setPaymentMethod(method);
//     if (method === 'mpesa') {
//       const msg = voiceMessages.mpesaPrompt[language as keyof typeof voiceMessages.mpesaPrompt] || voiceMessages.mpesaPrompt.en;
//       speak(msg, language);
//     } else if (method === 'cash') {
//       const msg = voiceMessages.cashPayment[language as keyof typeof voiceMessages.cashPayment] || voiceMessages.cashPayment.en;
//       speak(msg, language);
//     }
//   };

//   // ======== Texts ========
//   const getText = (key: string) => {
//     const texts: Record<string, Record<string, string>> = {
//       title: { en: 'Payment', sw: 'Malipo', fr: 'Paiement' },
//       total: { en: 'Total Amount', sw: 'Jumla', fr: 'Montant Total' },
//       mpesa: { en: 'Pay with M-Pesa', sw: 'Lipa na M-Pesa', fr: 'Payer avec M-Pesa' },
//       cash: { en: 'Pay with Cash', sw: 'Lipa Taslimu', fr: 'Payer en Espèces' },
//       enterPhone: { en: 'Enter your M-Pesa phone number', sw: 'Ingiza nambari yako ya M-Pesa', fr: 'Entrez votre numéro M-Pesa' },
//       stkPush: { en: 'Check your phone for M-Pesa prompt', sw: 'Angalia simu yako kwa M-Pesa prompt', fr: 'Vérifiez votre téléphone pour M-Pesa' },
//       success: { en: 'Payment Successful!', sw: 'Malipo Yamefanikiwa!', fr: 'Paiement Réussi!' },
//       insertCash: { en: 'Insert cash into the machine', sw: 'Ingiza pesa kwenye mashine', fr: "Insérez l'argent dans la machine" },
//       back: { en: 'Back', sw: 'Rudi', fr: 'Retour' },
//       confirm: { en: 'Confirm Cash Received', sw: 'Thibitisha Pesa Imepokelewa', fr: 'Confirmer Argent Reçu' },
//       retry: { en: 'Try Again', sw: 'Jaribu Tena', fr: 'Réessayer' }
//     };
//     return texts[key]?.[language] || texts[key]?.['en'] || key;
//   };

//   // ======== Render Success / Failed ========
//   if (status === 'success') {
//     return (
//       <motion.div
//         initial={{ opacity: 0, scale: 0.9 }}
//         animate={{ opacity: 1, scale: 1 }}
//         className="glass rounded-xl p-8 text-center space-y-6"
//       >
//         <motion.div
//           initial={{ scale: 0 }}
//           animate={{ scale: 1 }}
//           transition={{ type: 'spring', bounce: 0.5 }}
//         >
//           <CheckCircle className="w-24 h-24 text-success mx-auto glow-success" />
//         </motion.div>
//         <h2 className="text-3xl font-orbitron text-success">{getText('success')}</h2>
//         <p className="text-xl">KES {order.total_amount.toLocaleString()}</p>
//       </motion.div>
//     );
//   }

//   if (status === 'failed') {
//     return (
//       <motion.div
//         initial={{ opacity: 0 }}
//         animate={{ opacity: 1 }}
//         className="glass rounded-xl p-8 text-center space-y-6"
//       >
//         <XCircle className="w-20 h-20 text-destructive mx-auto" />
//         <h2 className="text-2xl font-orbitron text-destructive">Payment Failed</h2>
//         {errorMessage && <p className="text-muted-foreground">{errorMessage}</p>}
//         <Button
//           className="w-full h-12"
//           onClick={() => {
//             setStatus('idle');
//             setPaymentMethod(null);
//             setErrorMessage(null);
//           }}
//         >
//           {getText('retry')}
//         </Button>
//       </motion.div>
//     );
//   }

//   // ======== Main Render ========
//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="glass rounded-xl p-6 space-y-6"
//     >
//       <h2 className="text-2xl font-orbitron text-primary text-center">{getText('title')}</h2>

//       {/* Total */}
//       <div className="text-center bg-muted/50 rounded-lg p-4">
//         <p className="text-muted-foreground">{getText('total')}</p>
//         <p className="text-4xl font-orbitron text-primary text-glow">
//           KES {order.total_amount.toLocaleString()}
//         </p>
//       </div>

//       {/* Payment Method Selection */}
//       {!paymentMethod && status === 'idle' && (
//         <div className="grid grid-cols-2 gap-4">
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-primary hover:border-primary"
//             onClick={() => handleMethodSelect('mpesa')}
//           >
//             <Phone className="w-12 h-12 text-success" />
//             <span className="text-lg">{getText('mpesa')}</span>
//           </Button>

//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-accent hover:border-accent"
//             onClick={() => handleMethodSelect('cash')}
//           >
//             <Banknote className="w-12 h-12 text-warning" />
//             <span className="text-lg">{getText('cash')}</span>
//           </Button>

//           {/* Back button */}
//           <Button
//             variant="outline"
//             className="col-span-2 h-16 flex items-center justify-center gap-4
//                        border-accent text-accent
//                        hover:bg-green-600 hover:text-white hover:border-green-600
//                        transition-all duration-200"
//             onClick={onBack}
//           >
//             <ArrowLeft className="w-14 h-14 stroke-[3]" />
//             <span className="text-lg font-semibold">
//               {language === 'sw' ? 'Rudi Kuhariri Bidhaa' : 'Go Back to Edit Products'}
//             </span>
//           </Button>
//         </div>
//       )}

//       {/* M-Pesa flow */}
//       {paymentMethod === 'mpesa' && status === 'idle' && (
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="space-y-4"
//         >
//           <p className="text-center text-muted-foreground">{getText('enterPhone')}</p>
//           <Input
//             type="tel"
//             placeholder="0712345678"
//             value={phoneNumber}
//             onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
//             className="text-2xl text-center h-14"
//             maxLength={10}
//           />
//           <Button
//             className="w-full h-14 text-xl font-orbitron glow-success"
//             onClick={handleMpesaPayment}
//             disabled={phoneNumber.length < 10}
//           >
//             <Phone className="w-6 h-6 mr-2" />
//             {getText('mpesa')}
//           </Button>
//           <Button variant="ghost" className="w-full" onClick={() => setPaymentMethod(null)}>
//             {getText('back')}
//           </Button>
//         </motion.div>
//       )}

//       {(paymentMethod === 'mpesa') && (status === 'processing' || status === 'polling') && (
//         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
//           <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
//             <Loader2 className="w-16 h-16 text-success mx-auto" />
//           </motion.div>
//           <p className="text-xl">{getText('stkPush')}</p>
//           <div className="bg-success/20 rounded-lg p-4">
//             <Phone className="w-8 h-8 text-success mx-auto mb-2" />
//             <p className="text-success font-mono">{phoneNumber}</p>
//           </div>
//           {status === 'polling' && <p className="text-sm text-muted-foreground animate-pulse">Waiting for confirmation...</p>}
//         </motion.div>
//       )}

//       {/* Cash flow */}
//       {paymentMethod === 'cash' && status === 'idle' && (
//         <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-center">
//           <Banknote className="w-16 h-16 text-warning mx-auto" />
//           <p className="text-xl">{getText('insertCash')}</p>
//           <Button className="w-full h-14 text-xl font-orbitron glow-warning" onClick={handleCashPayment}>
//             {getText('confirm')}
//           </Button>
//           <Button variant="ghost" className="w-full" onClick={() => setPaymentMethod(null)}>
//             {getText('back')}
//           </Button>
//         </motion.div>
//       )}

//       {paymentMethod === 'cash' && status === 'processing' && (
//         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
//           <Loader2 className="w-16 h-16 text-warning mx-auto animate-spin" />
//           <p className="text-xl">Processing...</p>
//         </motion.div>
//       )}
//     </motion.div>
//   );
//}





























// nice but some payment logic was removed 
// import { useState, useEffect, useRef } from 'react';
// import { motion } from 'framer-motion';
// import { Phone, Banknote, ArrowLeft } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Order, PaymentMethod } from '@/types/shop';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// interface PaymentScreenProps {
//   order: Order;
//   onPaymentComplete: () => void;
//   language: string;
//   onBack: () => void; // ✅ Add this prop
// }

// export function PaymentScreen({ order, onPaymentComplete, language, onBack }: PaymentScreenProps) {
//   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
//   const [status] = useState<'idle' | 'processing' | 'polling' | 'success' | 'failed'>('idle');

//   useEffect(() => {
//     const message = voiceMessages.paymentPrompt[language as keyof typeof voiceMessages.paymentPrompt] || voiceMessages.paymentPrompt.en;
//     speak(message, language);
//   }, [language]);

//   const handleMethodSelect = (method: PaymentMethod) => {
//     setPaymentMethod(method);
//   };

//   const getText = (key: string) => {
//     const texts: Record<string, Record<string, string>> = {
//       title: { en: 'Payment', sw: 'Malipo', fr: 'Paiement' },
//       total: { en: 'Total Amount', sw: 'Jumla', fr: 'Montant Total' },
//       mpesa: { en: 'Pay with M-Pesa', sw: 'Lipa na M-Pesa', fr: 'Payer avec M-Pesa' },
//       cash: { en: 'Pay with Cash', sw: 'Lipa Taslimu', fr: 'Payer en Espèces' },
//       back: { en: 'Back', sw: 'Rudi', fr: 'Retour' }
//     };
//     return texts[key]?.[language] || texts[key]?.['en'] || key;
//   };

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="glass rounded-xl p-6 space-y-6"
//     >
//       <h2 className="text-2xl font-orbitron text-primary text-center">
//         {getText('title')}
//       </h2>

//       {/* Total */}
//       <div className="text-center bg-muted/50 rounded-lg p-4">
//         <p className="text-muted-foreground">{getText('total')}</p>
//         <p className="text-4xl font-orbitron text-primary text-glow">
//           KES {order.total_amount.toLocaleString()}
//         </p>
//       </div>

//       {/* Payment method selection */}
//       {!paymentMethod && status === 'idle' && (
//         <div className="grid grid-cols-2 gap-4">

//           {/* M-Pesa */}
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-primary hover:border-primary"
//             onClick={() => handleMethodSelect('mpesa')}
//           >
//             <Phone className="w-12 h-12 text-success" />
//             <span className="text-lg">{getText('mpesa')}</span>
//           </Button>

//           {/* Cash */}
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-accent hover:border-accent"
//             onClick={() => handleMethodSelect('cash')}
//           >
//             <Banknote className="w-12 h-12 text-warning" />
//             <span className="text-lg">{getText('cash')}</span>
//           </Button>

//           {/* 🔙 Go Back to Edit Products */}
//           <Button
//             variant="outline"
//             className="col-span-2 h-16 flex items-center justify-center gap-4
//                        border-accent text-accent 
//                        hover:bg-green-600 hover:text-white hover:border-green-600
//                        transition-all duration-200"
//             onClick={onBack} // ✅ Call the parent callback
//           >
//             <ArrowLeft className="w-14 h-14 stroke-[3]" /> {/* Big arrow */}
//             <span className="text-lg font-semibold">
//               {language === 'sw' ? 'Rudi Kuhariri Bidhaa' : 'Go Back to Edit Products'}
//             </span>
//           </Button>

//         </div>
//       )}
//     </motion.div>
//   );
// }











































// import { useState, useEffect, useRef } from 'react';
// import { motion } from 'framer-motion';
// import { Phone, CheckCircle, Loader2, Banknote, XCircle, ArrowLeft } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { supabase } from '@/integrations/supabase/client';
// import { Order, PaymentMethod } from '@/types/shop';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// interface PaymentScreenProps {
//   order: Order;
//   onPaymentComplete: () => void;
//   language: string;
// }

// export function PaymentScreen({ order, onPaymentComplete, language }: PaymentScreenProps) {
//   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
//   const [phoneNumber, setPhoneNumber] = useState('');
//   const [status, setStatus] = useState<'idle' | 'processing' | 'polling' | 'success' | 'failed'>('idle');
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [_checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
//   const pollingRef = useRef<NodeJS.Timeout | null>(null);
//   const hasSpokenPrompt = useRef(false);

//   useEffect(() => {
//     if (!hasSpokenPrompt.current) {
//       hasSpokenPrompt.current = true;
//       const message = voiceMessages.paymentPrompt[language as keyof typeof voiceMessages.paymentPrompt] || voiceMessages.paymentPrompt.en;
//       speak(message, language);
//     }
//   }, [language]);

//   useEffect(() => {
//     return () => {
//       if (pollingRef.current) clearInterval(pollingRef.current);
//     };
//   }, []);

//   const handleMethodSelect = (method: PaymentMethod) => {
//     setPaymentMethod(method);
//   };

//   const getText = (key: string) => {
//     const texts: Record<string, Record<string, string>> = {
//       title: { en: 'Payment', sw: 'Malipo', fr: 'Paiement' },
//       total: { en: 'Total Amount', sw: 'Jumla', fr: 'Montant Total' },
//       mpesa: { en: 'Pay with M-Pesa', sw: 'Lipa na M-Pesa', fr: 'Payer avec M-Pesa' },
//       cash: { en: 'Pay with Cash', sw: 'Lipa Taslimu', fr: 'Payer en Espèces' },
//       back: { en: 'Back', sw: 'Rudi', fr: 'Retour' }
//     };
//     return texts[key]?.[language] || texts[key]?.['en'] || key;
//   };

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="glass rounded-xl p-6 space-y-6"
//     >
//       <h2 className="text-2xl font-orbitron text-primary text-center">
//         {getText('title')}
//       </h2>

//       {/* Total */}
//       <div className="text-center bg-muted/50 rounded-lg p-4">
//         <p className="text-muted-foreground">{getText('total')}</p>
//         <p className="text-4xl font-orbitron text-primary text-glow">
//           KES {order.total_amount.toLocaleString()}
//         </p>
//       </div>

//       {/* Payment method selection */}
//       {!paymentMethod && status === 'idle' && (
//         <div className="grid grid-cols-2 gap-4">

//           {/* M-Pesa */}
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-primary hover:border-primary"
//             onClick={() => handleMethodSelect('mpesa')}
//           >
//             <Phone className="w-12 h-12 text-success" />
//             <span className="text-lg">{getText('mpesa')}</span>
//           </Button>

//           {/* Cash */}
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-accent hover:border-accent"
//             onClick={() => handleMethodSelect('cash')}
//           >
//             <Banknote className="w-12 h-12 text-warning" />
//             <span className="text-lg">{getText('cash')}</span>
//           </Button>

//           {/* 🔙 NEW BUTTON — Go Back to Edit Products
//           <Button
//             variant="outline"
//             className="col-span-2 h-14 flex items-center justify-center gap-2 border-accent text-accent hover:bg-accent/10"
//             onClick={() => window.history.back()}
//           >
//             <ArrowLeft className="w-6 h-6" />
//             {language === 'sw' ? 'Rudi Kuhariri Bidhaa' : 'Go Back to Edit Products'}
//           </Button> */}

//           {/* 🔙 Go Back to Products (FIXED) */}
// <Button
//   variant="outline"
//   className="col-span-2 h-14 flex items-center justify-center gap-3 
//              border-accent text-accent 
//              hover:bg-green-600 hover:text-white hover:border-green-600 
//              transition-all duration-200"
//   onClick={() =>  onStart('shopping')}
// >
//   {/* VERY BIG LONG ARROW */}
//   <ArrowLeft className="w-12 h-12 stroke-[3]" />

//   <span className="text-lg font-semibold">
//     {language === 'sw'
//       ? 'Rudi Kuhariri Bidhaa'
//       : 'Go Back to Edit Products'}
//   </span>
// </Button>


//         </div>
//       )}
//     </motion.div>
//   );
// }
































// original and super working 
// import { useState, useEffect, useRef } from 'react';
// import { motion } from 'framer-motion';
// import { Phone, CheckCircle, Loader2, Banknote, XCircle } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import { supabase } from '@/integrations/supabase/client';
// import { Order, PaymentMethod } from '@/types/shop';
// import { speak, voiceMessages } from '@/lib/voiceGuidance';

// interface PaymentScreenProps {
//   order: Order;
//   onPaymentComplete: () => void;
//   language: string;
// }

// export function PaymentScreen({ order, onPaymentComplete, language }: PaymentScreenProps) {
//   const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
//   const [phoneNumber, setPhoneNumber] = useState('');
//   const [status, setStatus] = useState<'idle' | 'processing' | 'polling' | 'success' | 'failed'>('idle');
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [_checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
//   const pollingRef = useRef<NodeJS.Timeout | null>(null);
//   const hasSpokenPrompt = useRef(false);

//   // Speak payment prompt on mount
//   useEffect(() => {
//     if (!hasSpokenPrompt.current) {
//       hasSpokenPrompt.current = true;
//       const message = voiceMessages.paymentPrompt[language as keyof typeof voiceMessages.paymentPrompt] || voiceMessages.paymentPrompt.en;
//       speak(message, language);
//     }
//   }, [language]);

//   // Cleanup polling on unmount
//   useEffect(() => {
//     return () => {
//       if (pollingRef.current) {
//         clearInterval(pollingRef.current);
//       }
//     };
//   }, []);

//   const handleMpesaPayment = async () => {
//     if (!phoneNumber || phoneNumber.length < 10) {
//       setErrorMessage('Please enter a valid phone number');
//       return;
//     }

//     setStatus('processing');
//     setErrorMessage(null);
    
//     // Speak M-Pesa prompt
//     const mpesaMessage = voiceMessages.mpesaWaiting[language as keyof typeof voiceMessages.mpesaWaiting] || voiceMessages.mpesaWaiting.en;
//     speak(mpesaMessage, language);

//     try {
//       // Call the M-Pesa STK Push edge function
//       const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
//         body: {
//           phone_number: phoneNumber,
//           amount: order.total_amount,
//           order_id: order.id,
//           account_reference: `ORDER-${order.id.substring(0, 8)}`,
//           description: 'AutoShop Payment'
//         }
//       });

//       if (error) {
//         throw new Error(error.message || 'Failed to initiate payment');
//       }

//       if (!data.success) {
//         throw new Error(data.error || 'Failed to send STK Push');
//       }

//       // Store checkout request ID and start polling
//       setCheckoutRequestId(data.checkout_request_id);
//       setStatus('polling');
      
//       // Start polling for payment status
//       startPolling(data.checkout_request_id);

//     } catch (error: any) {
//       console.error('M-Pesa payment error:', error);
//       setStatus('failed');
//       setErrorMessage(error.message || 'Payment failed. Please try again.');
      
//       // Fallback to simulation for demo purposes
//       setTimeout(() => {
//         simulateMpesaPayment();
//       }, 2000);
//     }
//   };

//   // Fallback simulation for demo/testing
//   const simulateMpesaPayment = async () => {
//     setStatus('processing');
//     setErrorMessage(null);
    
//     speak("Simulating payment for demo. Please wait.", language);

//     // Create payment record
//     const { data: payment } = await supabase
//       .from('payments')
//       .insert({
//         order_id: order.id,
//         method: 'mpesa',
//         amount: order.total_amount,
//         phone_number: phoneNumber,
//         status: 'pending',
//         mpesa_checkout_request_id: `SIM_${Date.now()}`
//       })
//       .select()
//       .single();

//     // Simulate STK Push delay
//     await new Promise(r => setTimeout(r, 3000));

//     // Simulate successful payment
//     if (payment) {
//       await supabase
//         .from('payments')
//         .update({ 
//           status: 'completed', 
//           verified: true,
//           mpesa_receipt: `MPESA${Date.now()}`,
//           verified_at: new Date().toISOString()
//         })
//         .eq('id', payment.id);

//       await supabase
//         .from('orders')
//         .update({ 
//           status: 'paid',
//           payment_method: 'mpesa',
//           payment_reference: `MPESA${Date.now()}`,
//           payment_verified: true
//         })
//         .eq('id', order.id);
//     }

//     handlePaymentSuccess();
//   };

//   const startPolling = (requestId: string) => {
//     let pollCount = 0;
//     const maxPolls = 24; // 2 minutes max (5 second intervals)

//     pollingRef.current = setInterval(async () => {
//       pollCount++;
      
//       if (pollCount > maxPolls) {
//         // Timeout - stop polling
//         if (pollingRef.current) clearInterval(pollingRef.current);
//         setStatus('failed');
//         setErrorMessage('Payment timeout. Please try again.');
//         return;
//       }

//       try {
//         const { data } = await supabase.functions.invoke('mpesa-query', {
//           body: { checkout_request_id: requestId }
//         });

//         if (data?.status === 'completed') {
//           if (pollingRef.current) clearInterval(pollingRef.current);
//           handlePaymentSuccess();
//         } else if (data?.status === 'failed') {
//           if (pollingRef.current) clearInterval(pollingRef.current);
//           setStatus('failed');
//           setErrorMessage(data.result_desc || 'Payment was cancelled or failed');
//         }
//         // If pending, continue polling
//       } catch (error) {
//         console.error('Polling error:', error);
//       }
//     }, 5000);
//   };

//   const handlePaymentSuccess = () => {
//     setStatus('success');
//     const successMessage = voiceMessages.paymentSuccess[language as keyof typeof voiceMessages.paymentSuccess] || voiceMessages.paymentSuccess.en;
//     speak(successMessage, language);
    
//     // Send purchase notification email to shop owner
//     supabase.functions.invoke('send-purchase-email', {
//       body: { order_id: order.id }
//     }).catch(err => console.error('Email notification error:', err));
    
//     setTimeout(onPaymentComplete, 2500);
//   };

//   const handleCashPayment = async () => {
//     setStatus('processing');
    
//     const cashMessage = voiceMessages.cashPayment[language as keyof typeof voiceMessages.cashPayment] || voiceMessages.cashPayment.en;
//     speak(cashMessage, language);

//     await supabase
//       .from('payments')
//       .insert({
//         order_id: order.id,
//         method: 'cash',
//         amount: order.total_amount,
//         status: 'completed',
//         verified: true
//       });

//     await supabase
//       .from('orders')
//       .update({ 
//         status: 'paid',
//         payment_method: 'cash',
//         payment_verified: true
//       })
//       .eq('id', order.id);

//     handlePaymentSuccess();
//   };

//   const handleMethodSelect = (method: PaymentMethod) => {
//     setPaymentMethod(method);
//     if (method === 'mpesa') {
//       const message = voiceMessages.mpesaPrompt[language as keyof typeof voiceMessages.mpesaPrompt] || voiceMessages.mpesaPrompt.en;
//       speak(message, language);
//     } else if (method === 'cash') {
//       const message = voiceMessages.cashPayment[language as keyof typeof voiceMessages.cashPayment] || voiceMessages.cashPayment.en;
//       speak(message, language);
//     }
//   };

//   const getText = (key: string) => {
//     const texts: Record<string, Record<string, string>> = {
//       title: { en: 'Payment', sw: 'Malipo', fr: 'Paiement' },
//       total: { en: 'Total Amount', sw: 'Jumla', fr: 'Montant Total' },
//       mpesa: { en: 'Pay with M-Pesa', sw: 'Lipa na M-Pesa', fr: 'Payer avec M-Pesa' },
//       cash: { en: 'Pay with Cash', sw: 'Lipa Taslimu', fr: 'Payer en Espèces' },
//       enterPhone: { en: 'Enter your M-Pesa phone number', sw: 'Ingiza nambari yako ya M-Pesa', fr: 'Entrez votre numéro M-Pesa' },
//       stkPush: { en: 'Check your phone for M-Pesa prompt', sw: 'Angalia simu yako kwa M-Pesa prompt', fr: 'Vérifiez votre téléphone pour M-Pesa' },
//       success: { en: 'Payment Successful!', sw: 'Malipo Yamefanikiwa!', fr: 'Paiement Réussi!' },
//       insertCash: { en: 'Insert cash into the machine', sw: 'Ingiza pesa kwenye mashine', fr: "Insérez l'argent dans la machine" },
//       back: { en: 'Back', sw: 'Rudi', fr: 'Retour' },
//       confirm: { en: 'Confirm Cash Received', sw: 'Thibitisha Pesa Imepokelewa', fr: 'Confirmer Argent Reçu' },
//       retry: { en: 'Try Again', sw: 'Jaribu Tena', fr: 'Réessayer' }
//     };
//     return texts[key]?.[language] || texts[key]?.['en'] || key;
//   };

//   if (status === 'success') {
//     return (
//       <motion.div
//         initial={{ opacity: 0, scale: 0.9 }}
//         animate={{ opacity: 1, scale: 1 }}
//         className="glass rounded-xl p-8 text-center space-y-6"
//       >
//         <motion.div
//           initial={{ scale: 0 }}
//           animate={{ scale: 1 }}
//           transition={{ type: 'spring', bounce: 0.5 }}
//         >
//           <CheckCircle className="w-24 h-24 text-success mx-auto glow-success" />
//         </motion.div>
//         <h2 className="text-3xl font-orbitron text-success">
//           {getText('success')}
//         </h2>
//         <p className="text-xl">KES {order.total_amount.toLocaleString()}</p>
//       </motion.div>
//     );
//   }

//   if (status === 'failed') {
//     return (
//       <motion.div
//         initial={{ opacity: 0 }}
//         animate={{ opacity: 1 }}
//         className="glass rounded-xl p-8 text-center space-y-6"
//       >
//         <XCircle className="w-20 h-20 text-destructive mx-auto" />
//         <h2 className="text-2xl font-orbitron text-destructive">Payment Failed</h2>
//         {errorMessage && (
//           <p className="text-muted-foreground">{errorMessage}</p>
//         )}
//         <Button
//           className="w-full h-12"
//           onClick={() => {
//             setStatus('idle');
//             setPaymentMethod(null);
//             setErrorMessage(null);
//           }}
//         >
//           {getText('retry')}
//         </Button>
//       </motion.div>
//     );
//   }

//   return (
//     <motion.div
//       initial={{ opacity: 0 }}
//       animate={{ opacity: 1 }}
//       className="glass rounded-xl p-6 space-y-6"
//     >
//       <h2 className="text-2xl font-orbitron text-primary text-center">
//         {getText('title')}
//       </h2>

//       {/* Total display */}
//       <div className="text-center bg-muted/50 rounded-lg p-4">
//         <p className="text-muted-foreground">{getText('total')}</p>
//         <p className="text-4xl font-orbitron text-primary text-glow">
//           KES {order.total_amount.toLocaleString()}
//         </p>
//       </div>

//       {/* Payment method selection */}
//       {!paymentMethod && status === 'idle' && (
//         <div className="grid grid-cols-2 gap-4">
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-primary hover:border-primary"
//             onClick={() => handleMethodSelect('mpesa')}
//           >
//             <Phone className="w-12 h-12 text-success" />
//             <span className="text-lg">{getText('mpesa')}</span>
//           </Button>
//           <Button
//             variant="outline"
//             className="h-32 flex-col gap-2 hover:glow-accent hover:border-accent"
//             onClick={() => handleMethodSelect('cash')}
//           >
//             <Banknote className="w-12 h-12 text-warning" />
//             <span className="text-lg">{getText('cash')}</span>
//           </Button>
//         </div>
//       )}

//       {/* M-Pesa flow */}
//       {paymentMethod === 'mpesa' && status === 'idle' && (
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="space-y-4"
//         >
//           <p className="text-center text-muted-foreground">
//             {getText('enterPhone')}
//           </p>
//           <div className="flex gap-2">
//             <Input
//               type="tel"
//               placeholder="0712345678"
//               value={phoneNumber}
//               onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
//               className="text-2xl text-center h-14"
//               maxLength={10}
//             />
//           </div>
//           <Button
//             className="w-full h-14 text-xl font-orbitron glow-success"
//             onClick={handleMpesaPayment}
//             disabled={phoneNumber.length < 10}
//           >
//             <Phone className="w-6 h-6 mr-2" />
//             {getText('mpesa')}
//           </Button>
//           <Button
//             variant="ghost"
//             className="w-full"
//             onClick={() => setPaymentMethod(null)}
//           >
//             {getText('back')}
//           </Button>
//         </motion.div>
//       )}

//       {/* M-Pesa processing/polling */}
//       {paymentMethod === 'mpesa' && (status === 'processing' || status === 'polling') && (
//         <motion.div
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           className="text-center space-y-4"
//         >
//           <motion.div
//             animate={{ rotate: 360 }}
//             transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
//           >
//             <Loader2 className="w-16 h-16 text-success mx-auto" />
//           </motion.div>
//           <p className="text-xl">{getText('stkPush')}</p>
//           <div className="bg-success/20 rounded-lg p-4">
//             <Phone className="w-8 h-8 text-success mx-auto mb-2" />
//             <p className="text-success font-mono">{phoneNumber}</p>
//           </div>
//           {status === 'polling' && (
//             <p className="text-sm text-muted-foreground animate-pulse">
//               Waiting for confirmation...
//             </p>
//           )}
//         </motion.div>
//       )}

//       {/* Cash flow */}
//       {paymentMethod === 'cash' && status === 'idle' && (
//         <motion.div
//           initial={{ opacity: 0, y: 20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="space-y-4 text-center"
//         >
//           <Banknote className="w-16 h-16 text-warning mx-auto" />
//           <p className="text-xl">{getText('insertCash')}</p>
//           <Button
//             className="w-full h-14 text-xl font-orbitron glow-warning"
//             onClick={handleCashPayment}
//           >
//             {getText('confirm')}
//           </Button>
//           <Button
//             variant="ghost"
//             className="w-full"
//             onClick={() => setPaymentMethod(null)}
//           >
//             {getText('back')}
//           </Button>
//         </motion.div>
//       )}

//       {paymentMethod === 'cash' && status === 'processing' && (
//         <motion.div
//           initial={{ opacity: 0 }}
//           animate={{ opacity: 1 }}
//           className="text-center space-y-4"
//         >
//           <Loader2 className="w-16 h-16 text-warning mx-auto animate-spin" />
//           <p className="text-xl">Processing...</p>
//         </motion.div>
//       )}
//     </motion.div>
//   );
// }
