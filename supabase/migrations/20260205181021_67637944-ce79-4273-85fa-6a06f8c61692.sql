-- ENUMS
CREATE TYPE public.order_status AS ENUM ('pending', 'processing', 'packing', 'payment_pending', 'paid', 'delivered', 'cancelled');
CREATE TYPE public.robot_status AS ENUM ('idle', 'picking', 'packing', 'delivering', 'error', 'maintenance');
CREATE TYPE public.payment_method AS ENUM ('mpesa', 'cash', 'card');
CREATE TYPE public.alert_type AS ENUM ('security', 'fire', 'theft', 'tamper', 'inventory', 'system', 'payment');
CREATE TYPE public.alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.session_status AS ENUM ('active', 'completed', 'abandoned', 'emergency');

-- PRODUCTS TABLE
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_swahili TEXT,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_threshold INTEGER DEFAULT 5,
    category TEXT NOT NULL,
    image_url TEXT,
    card_code TEXT UNIQUE,
    shelf_location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMER SESSIONS TABLE
CREATE TABLE public.customer_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status session_status DEFAULT 'active',
    entry_time TIMESTAMPTZ DEFAULT now(),
    exit_time TIMESTAMPTZ,
    preferred_language TEXT DEFAULT 'en',
    total_amount DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ORDERS TABLE
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.customer_sessions(id),
    status order_status DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method payment_method,
    payment_reference TEXT,
    payment_verified BOOLEAN DEFAULT false,
    robot_task_id TEXT,
    packed_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ORDER ITEMS TABLE
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    packed BOOLEAN DEFAULT false,
    substituted_product_id UUID REFERENCES public.products(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ROBOT TASKS TABLE
CREATE TABLE public.robot_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id),
    status robot_status DEFAULT 'idle',
    items_to_pick JSONB,
    items_picked JSONB,
    items_packed JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- INVENTORY LOGS TABLE
CREATE TABLE public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id),
    change_type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- PAYMENTS TABLE
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id),
    method payment_method NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    phone_number TEXT,
    mpesa_receipt TEXT,
    mpesa_checkout_request_id TEXT,
    status TEXT DEFAULT 'pending',
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    verified_at TIMESTAMPTZ
);

-- SECURITY ALERTS TABLE
CREATE TABLE public.security_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type alert_type NOT NULL,
    severity alert_severity NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- SYSTEM LOGS TABLE
CREATE TABLE public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- DAILY REPORTS TABLE
CREATE TABLE public.daily_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE UNIQUE NOT NULL,
    total_orders INTEGER DEFAULT 0,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_customers INTEGER DEFAULT 0,
    items_sold INTEGER DEFAULT 0,
    alerts_count INTEGER DEFAULT 0,
    low_stock_items JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- SHOP STATUS TABLE
CREATE TABLE public.shop_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_open BOOLEAN DEFAULT true,
    door_locked BOOLEAN DEFAULT false,
    robot_status robot_status DEFAULT 'idle',
    current_session_id UUID REFERENCES public.customer_sessions(id),
    conveyor_active BOOLEAN DEFAULT false,
    fire_alarm BOOLEAN DEFAULT false,
    emergency_mode BOOLEAN DEFAULT false,
    last_heartbeat TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- GREETINGS TABLE
CREATE TABLE public.greetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    language_code TEXT NOT NULL,
    greeting_text TEXT NOT NULL,
    farewell_text TEXT NOT NULL,
    order_confirm_text TEXT,
    payment_prompt_text TEXT,
    thank_you_text TEXT
);

-- Insert initial shop status
INSERT INTO public.shop_status (is_open, door_locked, robot_status) VALUES (true, false, 'idle');

-- Insert sample products
INSERT INTO public.products (name, name_swahili, price, stock_quantity, category, card_code, shelf_location) VALUES
('Milk 500ml', 'Maziwa 500ml', 85.00, 50, 'dairy', 'MILK001', 'A1'),
('Bread Loaf', 'Mkate', 55.00, 30, 'bakery', 'BREAD001', 'A2'),
('Sugar 1kg', 'Sukari 1kg', 180.00, 40, 'groceries', 'SUGAR001', 'B1'),
('Rice 1kg', 'Mchele 1kg', 220.00, 35, 'groceries', 'RICE001', 'B2'),
('Cooking Oil 1L', 'Mafuta ya Kupikia 1L', 350.00, 25, 'groceries', 'OIL001', 'B3'),
('Eggs (Tray)', 'Mayai (Trei)', 420.00, 20, 'dairy', 'EGGS001', 'A3'),
('Flour 2kg', 'Unga 2kg', 190.00, 30, 'groceries', 'FLOUR001', 'B4'),
('Tea Leaves 250g', 'Majani Chai 250g', 150.00, 45, 'beverages', 'TEA001', 'C1'),
('Soda 500ml', 'Soda 500ml', 70.00, 60, 'beverages', 'SODA001', 'C2'),
('Water 1L', 'Maji 1L', 50.00, 100, 'beverages', 'WATER001', 'C3'),
('Soap Bar', 'Sabuni', 45.00, 80, 'household', 'SOAP001', 'D1'),
('Toothpaste', 'Dawa ya Meno', 120.00, 35, 'household', 'TOOTH001', 'D2');

-- Insert greetings in multiple languages
INSERT INTO public.greetings (language_code, greeting_text, farewell_text, order_confirm_text, payment_prompt_text, thank_you_text) VALUES
('en', 'Welcome! How can I help you today?', 'Thank you for shopping with us! Goodbye!', 'Your order is confirmed.', 'Please complete your payment.', 'Thank you for your purchase!'),
('sw', 'Karibu! Naweza kukusaidia vipi leo?', 'Asante kwa kununua kwetu! Kwa heri!', 'Agizo lako limethibitishwa.', 'Tafadhali kamilisha malipo yako.', 'Asante kwa ununuzi wako!'),
('fr', 'Bienvenue! Comment puis-je vous aider?', 'Merci pour vos achats! Au revoir!', 'Votre commande est confirmée.', 'Veuillez compléter votre paiement.', 'Merci pour votre achat!');

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.robot_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.greetings ENABLE ROW LEVEL SECURITY;

-- Public read policies for kiosk operation
CREATE POLICY "Products are publicly readable" ON public.products FOR SELECT USING (true);
CREATE POLICY "Greetings are publicly readable" ON public.greetings FOR SELECT USING (true);
CREATE POLICY "Shop status is publicly readable" ON public.shop_status FOR SELECT USING (true);

-- Public insert/update for kiosk operations (sessions, orders)
CREATE POLICY "Anyone can create sessions" ON public.customer_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view sessions" ON public.customer_sessions FOR SELECT USING (true);
CREATE POLICY "Anyone can update sessions" ON public.customer_sessions FOR UPDATE USING (true);

CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Anyone can update orders" ON public.orders FOR UPDATE USING (true);

CREATE POLICY "Anyone can create order items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view order items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Anyone can update order items" ON public.order_items FOR UPDATE USING (true);

CREATE POLICY "Anyone can create robot tasks" ON public.robot_tasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view robot tasks" ON public.robot_tasks FOR SELECT USING (true);
CREATE POLICY "Anyone can update robot tasks" ON public.robot_tasks FOR UPDATE USING (true);

CREATE POLICY "Anyone can create payments" ON public.payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "Anyone can update payments" ON public.payments FOR UPDATE USING (true);

CREATE POLICY "Anyone can view alerts" ON public.security_alerts FOR SELECT USING (true);
CREATE POLICY "Anyone can create alerts" ON public.security_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update alerts" ON public.security_alerts FOR UPDATE USING (true);

CREATE POLICY "Anyone can view logs" ON public.system_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can create logs" ON public.system_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view reports" ON public.daily_reports FOR SELECT USING (true);
CREATE POLICY "Anyone can manage reports" ON public.daily_reports FOR ALL USING (true);

CREATE POLICY "Anyone can update shop status" ON public.shop_status FOR UPDATE USING (true);

CREATE POLICY "Anyone can view inventory logs" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can create inventory logs" ON public.inventory_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update products" ON public.products FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT WITH CHECK (true);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.robot_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_status;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;

-- Function to update product stock
CREATE OR REPLACE FUNCTION public.update_stock(p_product_id UUID, p_quantity INTEGER, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_stock INTEGER;
BEGIN
    SELECT stock_quantity INTO v_current_stock FROM products WHERE id = p_product_id;
    
    UPDATE products SET stock_quantity = stock_quantity - p_quantity, updated_at = now()
    WHERE id = p_product_id;
    
    INSERT INTO inventory_logs (product_id, change_type, quantity_change, previous_quantity, new_quantity, reason)
    VALUES (p_product_id, 'sale', -p_quantity, v_current_stock, v_current_stock - p_quantity, p_reason);
END;
$$;