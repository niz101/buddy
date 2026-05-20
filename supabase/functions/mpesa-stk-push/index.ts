import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// M-Pesa Daraja API Configuration
// Replace these with your actual credentials from Safaricom Developer Portal
const MPESA_CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY') || 'YOUR_CONSUMER_KEY';
const MPESA_CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET') || 'YOUR_CONSUMER_SECRET';
const MPESA_PASSKEY = Deno.env.get('MPESA_PASSKEY') || 'YOUR_PASSKEY';
const MPESA_SHORTCODE = Deno.env.get('MPESA_SHORTCODE') || '174379'; // Sandbox shortcode
const MPESA_CALLBACK_URL = Deno.env.get('MPESA_CALLBACK_URL') || 'https://your-domain.com/api/mpesa-callback';

// Use sandbox for testing, change to production URL for live
const MPESA_BASE_URL = 'https://sandbox.safaricom.co.ke';

interface STKPushRequest {
  phone_number: string;
  amount: number;
  order_id: string;
  account_reference?: string;
  description?: string;
}

// Generate OAuth token
async function getAccessToken(): Promise<string> {
  const auth = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  
  const response = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

// Generate password for STK Push
function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const str = shortcode + passkey + timestamp;
  return btoa(str);
}

// Format phone number to 254XXXXXXXXX format
function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('+254')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  
  return cleaned;
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

    const { phone_number, amount, order_id, account_reference, description }: STKPushRequest = await req.json();

    // Validate inputs
    if (!phone_number || !amount || !order_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: phone_number, amount, order_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const formattedPhone = formatPhoneNumber(phone_number);
    
    // Generate timestamp (YYYYMMDDHHmmss)
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    // Get OAuth token
    const accessToken = await getAccessToken();
    
    // Generate password
    const password = generatePassword(MPESA_SHORTCODE, MPESA_PASSKEY, timestamp);

    // STK Push request body
    const stkPushBody = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: account_reference || `ORDER-${order_id.substring(0, 8)}`,
      TransactionDesc: description || 'AutoShop Payment'
    };

    // Send STK Push request
    const stkResponse = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(stkPushBody),
    });

    const stkData = await stkResponse.json();

    if (stkData.ResponseCode === '0') {
      // STK Push initiated successfully
      const checkoutRequestId = stkData.CheckoutRequestID;
      const merchantRequestId = stkData.MerchantRequestID;

      // Create payment record in database
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          order_id,
          method: 'mpesa',
          amount,
          phone_number: formattedPhone,
          status: 'pending',
          mpesa_checkout_request_id: checkoutRequestId,
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Failed to create payment record:', paymentError);
      }

      // Log the transaction
      await supabase.from('system_logs').insert({
        event_type: 'mpesa_stk_push',
        message: `STK Push initiated for order ${order_id}`,
        details: {
          order_id,
          phone_number: formattedPhone,
          amount,
          checkout_request_id: checkoutRequestId,
          merchant_request_id: merchantRequestId,
        }
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: 'STK Push sent successfully. Check your phone.',
          checkout_request_id: checkoutRequestId,
          merchant_request_id: merchantRequestId,
          payment_id: payment?.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // STK Push failed
      console.error('STK Push failed:', stkData);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: stkData.errorMessage || 'Failed to initiate STK Push',
          response_code: stkData.ResponseCode,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in mpesa-stk-push:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
