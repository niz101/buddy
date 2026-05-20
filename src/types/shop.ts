export type OrderStatus = 'pending' | 'processing' | 'packing' | 'payment_pending' | 'paid' | 'delivered' | 'cancelled';
export type RobotStatus = 'idle' | 'picking' | 'packing' | 'delivering' | 'error' | 'maintenance';
export type PaymentMethod = 'mpesa' | 'cash' | 'card';
export type AlertType = 'security' | 'fire' | 'theft' | 'tamper' | 'inventory' | 'system' | 'payment';
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SessionStatus = 'active' | 'completed' | 'abandoned' | 'emergency';

export interface Product {
  id: string;
  name: string;
  name_swahili?: string;
  description?: string;
  price: number;
  stock_quantity: number;
  min_stock_threshold: number;
  category: string;
  image_url?: string;
  card_code?: string;
  shelf_location?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerSession {
  id: string;
  status: SessionStatus;
  entry_time: string;
  exit_time?: string;
  preferred_language: string;
  total_amount: number;
  created_at: string;
}

export interface Order {
  id: string;
  session_id?: string;
  status: OrderStatus;
  total_amount: number;
  payment_method?: PaymentMethod;
  payment_reference?: string;
  payment_verified: boolean;
  robot_task_id?: string;
  packed_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  packed: boolean;
  substituted_product_id?: string;
  created_at: string;
  product?: Product;
}

export interface RobotTask {
  id: string;
  order_id: string;
  status: RobotStatus;
  items_to_pick: ItemToPick[];
  items_picked: ItemToPick[];
  items_packed: ItemToPick[];
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface ItemToPick {
  product_id: string;
  product_name: string;
  quantity: number;
  shelf_location: string;
}

export interface Payment {
  id: string;
  order_id: string;
  method: PaymentMethod;
  amount: number;
  phone_number?: string;
  mpesa_receipt?: string;
  mpesa_checkout_request_id?: string;
  status: string;
  verified: boolean;
  created_at: string;
  verified_at?: string;
}

export interface SecurityAlert {
  id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
}

export interface ShopStatus {
  id: string;
  is_open: boolean;
  door_locked: boolean;
  robot_status: RobotStatus;
  current_session_id?: string;
  conveyor_active: boolean;
  fire_alarm: boolean;
  emergency_mode: boolean;
  last_heartbeat: string;
  updated_at: string;
}

export interface Greeting {
  id: string;
  language_code: string;
  greeting_text: string;
  farewell_text: string;
  order_confirm_text?: string;
  payment_prompt_text?: string;
  thank_you_text?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface DailyReport {
  id: string;
  report_date: string;
  total_orders: number;
  total_revenue: number;
  total_customers: number;
  items_sold: number;
  alerts_count: number;
  low_stock_items?: Product[];
  created_at: string;
}
