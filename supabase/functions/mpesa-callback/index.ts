import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MpesaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const callbackData: MpesaCallbackBody = await req.json();
    const { stkCallback } = callbackData.Body;

    console.log('M-Pesa Callback received:', JSON.stringify(stkCallback, null, 2));

    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Find the payment record
    const { data: payment, error: findError } = await supabase
      .from('payments')
      .select('*, orders(*)')
      .eq('mpesa_checkout_request_id', checkoutRequestId)
      .single();

    if (findError || !payment) {
      console.error('Payment not found for checkout request:', checkoutRequestId);
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (resultCode === 0) {
      // Payment successful
      let mpesaReceipt = '';
      let transactionDate = '';
      let phoneNumber = '';
      let paidAmount = 0;

      // Extract callback metadata
      if (stkCallback.CallbackMetadata?.Item) {
        for (const item of stkCallback.CallbackMetadata.Item) {
          switch (item.Name) {
            case 'MpesaReceiptNumber':
              mpesaReceipt = String(item.Value);
              break;
            case 'TransactionDate':
              transactionDate = String(item.Value);
              break;
            case 'PhoneNumber':
              phoneNumber = String(item.Value);
              break;
            case 'Amount':
              paidAmount = Number(item.Value);
              break;
          }
        }
      }

      // Update payment record
      await supabase
        .from('payments')
        .update({
          status: 'completed',
          verified: true,
          verified_at: new Date().toISOString(),
          mpesa_receipt: mpesaReceipt,
        })
        .eq('id', payment.id);

      // Update order status
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method: 'mpesa',
          payment_reference: mpesaReceipt,
          payment_verified: true,
        })
        .eq('id', payment.order_id);

      // Log successful payment
      await supabase.from('system_logs').insert({
        event_type: 'mpesa_payment_success',
        message: `M-Pesa payment completed for order ${payment.order_id}`,
        details: {
          order_id: payment.order_id,
          payment_id: payment.id,
          mpesa_receipt: mpesaReceipt,
          amount: paidAmount,
          phone_number: phoneNumber,
          transaction_date: transactionDate,
        }
      });

      console.log('Payment verified successfully:', mpesaReceipt);

    } else {
      // Payment failed
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          verified: false,
        })
        .eq('id', payment.id);

      // Log failed payment
      await supabase.from('system_logs').insert({
        event_type: 'mpesa_payment_failed',
        message: `M-Pesa payment failed: ${resultDesc}`,
        details: {
          order_id: payment.order_id,
          payment_id: payment.id,
          result_code: resultCode,
          result_desc: resultDesc,
        }
      });

      console.log('Payment failed:', resultDesc);
    }

    // Always respond with success to M-Pesa
    return new Response(
      JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    return new Response(
      JSON.stringify({ ResultCode: 1, ResultDesc: 'Error processing callback' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
