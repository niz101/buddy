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

    // Get today's date range (East Africa Time)
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Fetch today's orders
    const { data: orders } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    const totalOrders = orders?.length || 0;
    const totalRevenue = orders?.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0) || 0;
    const paidOrders = orders?.filter((o: any) => o.payment_verified) || [];
    const pendingOrders = orders?.filter((o: any) => !o.payment_verified && o.status !== 'cancelled') || [];

    // Payment method breakdown
    const mpesaOrders = paidOrders.filter((o: any) => o.payment_method === 'mpesa');
    const cashOrders = paidOrders.filter((o: any) => o.payment_method === 'cash');

    // Fetch today's sessions
    const { data: sessions } = await supabase
      .from("customer_sessions")
      .select("*")
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    const totalCustomers = sessions?.length || 0;

    // Fetch order items for today
    const orderIds = orders?.map((o: any) => o.id) || [];
    let itemsSold = 0;
    let topProducts: Record<string, { name: string; qty: number; revenue: number }> = {};

    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from("order_items")
        .select("*, products(name)")
        .in("order_id", orderIds);

      items?.forEach((item: any) => {
        itemsSold += item.quantity;
        const name = item.products?.name || 'Unknown';
        if (!topProducts[name]) {
          topProducts[name] = { name, qty: 0, revenue: 0 };
        }
        topProducts[name].qty += item.quantity;
        topProducts[name].revenue += item.quantity * item.unit_price;
      });
    }

    const sortedProducts = Object.values(topProducts).sort((a, b) => b.qty - a.qty);

    // Fetch low stock products
    const { data: lowStockProducts } = await supabase
      .from("products")
      .select("name, stock_quantity, min_stock_threshold")
      .eq("is_active", true)
      .lt("stock_quantity", 10);

    // Fetch today's alerts
    const { data: alerts } = await supabase
      .from("security_alerts")
      .select("*")
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    const alertsCount = alerts?.length || 0;

    const dateStr = now.toLocaleDateString('en-KE', { 
      timeZone: 'Africa/Nairobi',
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    // Save daily report to database
    const reportDate = now.toISOString().split('T')[0];
    await supabase.from("daily_reports").upsert({
      report_date: reportDate,
      total_orders: totalOrders,
      total_revenue: totalRevenue,
      total_customers: totalCustomers,
      items_sold: itemsSold,
      alerts_count: alertsCount,
      low_stock_items: lowStockProducts as any,
    }, { onConflict: 'report_date' });

    // Build report content
    const subject = `📊 AutoShop Daily Report - ${dateStr} - KES ${totalRevenue.toLocaleString()}`;

    const textReport = `
AutoShop Daily Report
=====================
📅 ${dateStr}

💰 REVENUE SUMMARY
  Total Revenue: KES ${totalRevenue.toLocaleString()}
  Total Orders: ${totalOrders}
  Paid Orders: ${paidOrders.length}
  Pending: ${pendingOrders.length}

💳 PAYMENT BREAKDOWN
  M-Pesa: ${mpesaOrders.length} orders (KES ${mpesaOrders.reduce((s: number, o: any) => s + o.total_amount, 0).toLocaleString()})
  Cash: ${cashOrders.length} orders (KES ${cashOrders.reduce((s: number, o: any) => s + o.total_amount, 0).toLocaleString()})

👥 CUSTOMERS
  Total Visits: ${totalCustomers}
  Items Sold: ${itemsSold}

📦 TOP PRODUCTS
${sortedProducts.slice(0, 10).map((p, i) => `  ${i + 1}. ${p.name} — ${p.qty} units (KES ${p.revenue.toLocaleString()})`).join('\n') || '  No sales today'}

⚠️ LOW STOCK ALERTS
${lowStockProducts?.map((p: any) => `  • ${p.name}: ${p.stock_quantity} units remaining`).join('\n') || '  All items well-stocked ✅'}

🚨 SECURITY ALERTS: ${alertsCount}
${alerts?.slice(0, 5).map((a: any) => `  • [${a.severity}] ${a.message}`).join('\n') || '  No alerts today ✅'}

---
AutoShop Kiosk System — Automated Daily Report
    `.trim();

    // Log the report
    await supabase.from("system_logs").insert({
      event_type: "daily_report",
      message: subject,
      details: {
        report_date: reportDate,
        total_orders: totalOrders,
        total_revenue: totalRevenue,
        total_customers: totalCustomers,
        items_sold: itemsSold,
        alerts_count: alertsCount,
        email_to: OWNER_EMAIL,
        sent_at: now.toISOString(),
      },
    });

    // Try Resend email
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;

    if (RESEND_API_KEY) {
      try {
        const { Resend } = await import("npm:resend@2.0.0");
        const resend = new Resend(RESEND_API_KEY);

        const htmlReport = `
          <div style="font-family: 'Courier New', monospace; max-width: 650px; margin: 0 auto; background: #0a0a0a; color: #e0e0e0; padding: 24px; border: 1px solid #333;">
            <h1 style="color: #00ff88; border-bottom: 2px solid #00ff88; padding-bottom: 12px;">📊 AutoShop Daily Report</h1>
            <p style="color: #888;">${dateStr}</p>
            
            <div style="display: flex; gap: 16px; margin: 20px 0;">
              <div style="flex: 1; background: #111; border: 1px solid #00ff88; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="font-size: 2em; color: #00ff88; font-weight: bold;">KES ${totalRevenue.toLocaleString()}</div>
                <div style="color: #888; font-size: 0.85em;">Total Revenue</div>
              </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; color: #888;">Total Orders</td><td style="padding: 8px; font-weight: bold;">${totalOrders}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Paid</td><td style="padding: 8px; color: #00ff88;">${paidOrders.length}</td></tr>
              <tr><td style="padding: 8px; color: #888;">M-Pesa</td><td style="padding: 8px;">${mpesaOrders.length} orders</td></tr>
              <tr><td style="padding: 8px; color: #888;">Cash</td><td style="padding: 8px;">${cashOrders.length} orders</td></tr>
              <tr><td style="padding: 8px; color: #888;">Customers</td><td style="padding: 8px;">${totalCustomers}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Items Sold</td><td style="padding: 8px;">${itemsSold}</td></tr>
              <tr><td style="padding: 8px; color: #888;">Alerts</td><td style="padding: 8px; ${alertsCount > 0 ? 'color: #ff4444;' : ''}">${alertsCount}</td></tr>
            </table>
            
            ${sortedProducts.length > 0 ? `
              <h2 style="color: #00aaff;">📦 Top Products</h2>
              <table style="width: 100%; border-collapse: collapse;">
                ${sortedProducts.slice(0, 10).map((p, i) => `
                  <tr style="border-bottom: 1px solid #222;">
                    <td style="padding: 6px;">${i + 1}. ${p.name}</td>
                    <td style="padding: 6px; text-align: center;">${p.qty} units</td>
                    <td style="padding: 6px; text-align: right;">KES ${p.revenue.toLocaleString()}</td>
                  </tr>
                `).join('')}
              </table>
            ` : ''}
            
            ${(lowStockProducts?.length || 0) > 0 ? `
              <h2 style="color: #ffaa00;">⚠️ Low Stock</h2>
              <ul style="padding-left: 20px;">
                ${lowStockProducts?.map((p: any) => `<li style="padding: 4px 0;">${p.name}: <span style="color: #ff4444;">${p.stock_quantity} units</span></li>`).join('')}
              </ul>
            ` : '<p style="color: #00ff88;">✅ All items well-stocked</p>'}
            
            <p style="margin-top: 20px; padding-top: 12px; border-top: 1px solid #333; color: #666; font-size: 0.85em;">
              AutoShop Kiosk System — Automated Daily Report
            </p>
          </div>
        `;

        await resend.emails.send({
          from: "AutoShop <noreply@autoshop.lovable.app>",
          to: [OWNER_EMAIL],
          subject,
          html: htmlReport,
        });

        emailSent = true;
      } catch (emailErr: any) {
        console.error("Resend email error:", emailErr.message);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        logged: true,
        report: {
          date: reportDate,
          total_orders: totalOrders,
          total_revenue: totalRevenue,
          total_customers: totalCustomers,
          items_sold: itemsSold,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-daily-report:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
