import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// M-Pesa Daraja API Configuration
const MPESA_CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY') || 'YOUR_CONSUMER_KEY';
const MPESA_CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET') || 'YOUR_CONSUMER_SECRET';
const MPESA_PASSKEY = Deno.env.get('MPESA_PASSKEY') || 'YOUR_PASSKEY';
const MPESA_SHORTCODE = Deno.env.get('MPESA_SHORTCODE') || '174379';
const MPESA_BASE_URL = 'https://sandbox.safaricom.co.ke';

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

function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const str = shortcode + passkey + timestamp;
  return btoa(str);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { checkout_request_id } = await req.json();

    if (!checkout_request_id) {
      return new Response(
        JSON.stringify({ error: 'checkout_request_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // First check database for payment status
    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('mpesa_checkout_request_id', checkout_request_id)
      .single();

    if (payment?.status === 'completed') {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'completed',
          mpesa_receipt: payment.mpesa_receipt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payment?.status === 'failed') {
      return new Response(
        JSON.stringify({
          success: false,
          status: 'failed',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Query M-Pesa for status
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');

    const accessToken = await getAccessToken();
    const password = generatePassword(MPESA_SHORTCODE, MPESA_PASSKEY, timestamp);

    const queryResponse = await fetch(`${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkout_request_id,
      }),
    });

    const queryData = await queryResponse.json();

    if (queryData.ResultCode === '0') {
      // Payment was successful
      return new Response(
        JSON.stringify({
          success: true,
          status: 'completed',
          result_desc: queryData.ResultDesc,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (queryData.ResultCode) {
      // Payment failed
      return new Response(
        JSON.stringify({
          success: false,
          status: 'failed',
          result_code: queryData.ResultCode,
          result_desc: queryData.ResultDesc,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Still pending
      return new Response(
        JSON.stringify({
          success: true,
          status: 'pending',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error querying M-Pesa:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
