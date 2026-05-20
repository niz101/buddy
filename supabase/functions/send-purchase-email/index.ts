import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_EMAIL = "datamodb@gmail.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "Missing order_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message}`);
    }

    // Fetch order items with product names
    const { data: items } = await supabase
      .from("order_items")
      .select("*, products(name, category, shelf_location)")
      .eq("order_id", order_id);

    // Build email content
    const itemsList = (items || []).map((item: any) => 
      `• ${item.products?.name || 'Unknown'} × ${item.quantity} @ KES ${item.unit_price} = KES ${item.quantity * item.unit_price}`
    ).join('\n');

    const now = new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
    
    const subject = `🛒 New Purchase - Order ${order_id.substring(0, 8)} - KES ${order.total_amount}`;
    
    const body = `
AutoShop - New Purchase Notification
=====================================

📅 Date: ${now}
🆔 Order ID: ${order_id}
💰 Total Amount: KES ${order.total_amount.toLocaleString()}
💳 Payment Method: ${order.payment_method || 'N/A'}
📋 Payment Verified: ${order.payment_verified ? 'Yes ✅' : 'No ❌'}

📦 Items Purchased:
${itemsList || '  No items found'}

📊 Order Status: ${order.status}
${order.payment_reference ? `🧾 Payment Reference: ${order.payment_reference}` : ''}

---
This is an automated notification from AutoShop Kiosk System.
    `.trim();

    // Use Lovable AI gateway to format a nice HTML email
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    // Send email using Supabase's built-in email or log it
    // For now, we'll use a simple approach - store the notification
    // and also try to send via any configured email service
    
    // Store notification in system_logs for the admin dashboard
    await supabase.from("system_logs").insert({
      event_type: "purchase_notification",
      message: subject,
      details: {
        order_id,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        items: items?.map((i: any) => ({
          name: i.products?.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
        email_to: OWNER_EMAIL,
        email_body: body,
        sent_at: now,
      },
    });

    // Try to send via Resend if API key is configured
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    
    if (RESEND_API_KEY) {
      try {
        const { Resend } = await import("npm:resend@2.0.0");
        const resend = new Resend(RESEND_API_KEY);
        
        const htmlBody = `
          <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e0e0e0; padding: 24px; border: 1px solid #333;">
            <h1 style="color: #00ff88; border-bottom: 2px solid #00ff88; padding-bottom: 12px;">🛒 New Purchase</h1>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; color: #888;">Date</td><td style="padding: 8px;">${now}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Order ID</td><td style="padding: 8px; font-family: monospace;">${order_id.substring(0, 8)}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Total</td><td style="padding: 8px; color: #00ff88; font-size: 1.3em; font-weight: bold;">KES ${order.total_amount.toLocaleString()}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Payment</td><td style="padding: 8px;">${order.payment_method || 'N/A'} ${order.payment_verified ? '✅' : '❌'}</td></tr>
            </table>
            <h2 style="color: #00aaff; margin-top: 20px;">📦 Items</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #333;">
                <th style="padding: 8px; text-align: left; color: #888;">Item</th>
                <th style="padding: 8px; text-align: center; color: #888;">Qty</th>
                <th style="padding: 8px; text-align: right; color: #888;">Price</th>
              </tr>
              ${(items || []).map((item: any) => `
                <tr style="border-bottom: 1px solid #222;">
                  <td style="padding: 8px;">${item.products?.name || 'Unknown'}</td>
                  <td style="padding: 8px; text-align: center;">${item.quantity}</td>
                  <td style="padding: 8px; text-align: right;">KES ${(item.quantity * item.unit_price).toLocaleString()}</td>
                </tr>
              `).join('')}
            </table>
            <p style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #333; color: #666; font-size: 0.85em;">
              AutoShop Kiosk System — Automated Notification
            </p>
          </div>
        `;

        await resend.emails.send({
          from: "AutoShop <noreply@autoshop.lovable.app>",
          to: [OWNER_EMAIL],
          subject,
          html: htmlBody,
        });
        
        emailSent = true;
      } catch (emailErr: any) {
        console.error("Resend email error:", emailErr.message);
        // Non-fatal - notification is still logged
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: emailSent,
        logged: true,
        message: emailSent 
          ? `Purchase notification emailed to ${OWNER_EMAIL}`
          : `Purchase notification logged (configure RESEND_API_KEY for email delivery)`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-purchase-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
