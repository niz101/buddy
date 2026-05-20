import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, ShopStatus, Greeting, CartItem, CustomerSession, Order, RobotTask } from '@/types/shop';
import { hardwareBridge } from '@/lib/hardwarebridge';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });
    
    if (!error && data) {
      setProducts(data as Product[]);
    }
    setLoading(false);
  };

  return { products, loading, refetch: fetchProducts };
}

export function useShopStatus() {
  const [shopStatus, setShopStatus] = useState<ShopStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    
    const channel = supabase
      .channel('shop_status_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_status' }, () => {
        fetchStatus();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchStatus = async () => {
    const { data, error } = await supabase
      .from('shop_status')
      .select('*')
      .single();
    
    if (!error && data) {
      setShopStatus(data as ShopStatus);
    }
    setLoading(false);
  };

  const updateStatus = async (updates: Partial<ShopStatus>) => {
    if (!shopStatus) return;
    await supabase.from('shop_status').update(updates).eq('id', shopStatus.id);
  };

  return { shopStatus, loading, updateStatus, refetch: fetchStatus };
}

export function useGreetings(languageCode: string = 'en') {
  const [greeting, setGreeting] = useState<Greeting | null>(null);

  useEffect(() => {
    fetchGreeting();
  }, [languageCode]);

  const fetchGreeting = async () => {
    const { data } = await supabase
      .from('greetings')
      .select('*')
      .eq('language_code', languageCode)
      .single();
    
    if (data) setGreeting(data as Greeting);
  };

  return { greeting };
}

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => 
      prev.map(item => 
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => setCart([]), []);

  const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return { cart, addToCart, removeFromCart, updateQuantity, clearCart, total, itemCount };
}

export function useSession() {
  const [session, setSession] = useState<CustomerSession | null>(null);

  const startSession = async (language: string = 'en') => {
    const { data, error } = await supabase
      .from('customer_sessions')
      .insert({ preferred_language: language, status: 'active' })
      .select()
      .single();
    
    if (!error && data) {
      setSession(data as CustomerSession);
      await supabase.from('shop_status').update({ 
        door_locked: true, 
        current_session_id: data.id 
      }).neq('id', '');
    }
    return data as CustomerSession | null;
  };

  const endSession = async () => {
    if (!session) return;
    await supabase
      .from('customer_sessions')
      .update({ status: 'completed', exit_time: new Date().toISOString() })
      .eq('id', session.id);
    
    await supabase.from('shop_status').update({ 
      door_locked: false, 
      current_session_id: null,
      robot_status: 'idle',
      conveyor_active: false
    }).neq('id', '');
    
    setSession(null);
  };

  return { session, startSession, endSession, setSession };
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data) setOrders(data as Order[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
    
    const channel = supabase
      .channel('orders_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const createOrder = async (sessionId: string, cart: CartItem[], total: number) => {
    const { data: order, error } = await supabase
      .from('orders')
      .insert({ session_id: sessionId, total_amount: total, status: 'pending' })
      .select()
      .single();
    
    if (error || !order) return null;

    const orderItems = cart.map(item => ({
      order_id: order.id,
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.product.price
    }));

    await supabase.from('order_items').insert(orderItems);
    
    return order as Order;
  };

  return { orders, loading, createOrder, refetch: fetchOrders };
}

export function useRobotSimulation() {
  const [task, setTask] = useState<RobotTask | null>(null);
  const [progress, setProgress] = useState(0);

  const startPickAndPack = async (order: Order, items: CartItem[]) => {
    const itemsToPick = items.map(item => ({
      product_id: item.product.id,
      product_name: item.product.name,
      quantity: item.quantity,
      shelf_location: item.product.shelf_location || 'A1'
    }));

    const { data: robotTask } = await supabase
      .from('robot_tasks')
      .insert({
        order_id: order.id,
        status: 'picking',
        items_to_pick: itemsToPick as unknown as any,
        items_picked: [] as unknown as any,
        items_packed: [] as unknown as any,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (robotTask) {
      setTask(robotTask as unknown as RobotTask);
      await supabase.from('orders').update({ 
        status: 'processing', 
        robot_task_id: robotTask.id 
      }).eq('id', order.id);
      
      await supabase.from('shop_status').update({ robot_status: 'picking' }).neq('id', '');
      
      // Simulate picking
      simulateRobotWork(robotTask as unknown as RobotTask, itemsToPick);
    }

    return robotTask;
  };

  const simulateRobotWork = async (robotTask: RobotTask, items: any[]) => {
    let picked: any[] = [];
    
    // Send PICK command to Arduino (LED blinks × item count)
    hardwareBridge.pick(items.length);
    
    // Picking phase
    for (let i = 0; i < items.length; i++) {
      await new Promise(r => setTimeout(r, 1500));
      picked.push(items[i]);
      setProgress(((i + 1) / items.length) * 50);
      
      await supabase.from('robot_tasks').update({ 
        items_picked: picked 
      }).eq('id', robotTask.id);
    }

    // Send PACK command to Arduino (LED blinks × item count)
    hardwareBridge.pack(items.length);

    // Packing phase
    await supabase.from('robot_tasks').update({ status: 'packing' }).eq('id', robotTask.id);
    await supabase.from('shop_status').update({ robot_status: 'packing' }).neq('id', '');
    
    let packed: any[] = [];
    for (let i = 0; i < items.length; i++) {
      await new Promise(r => setTimeout(r, 1000));
      packed.push(items[i]);
      setProgress(50 + ((i + 1) / items.length) * 40);
      
      await supabase.from('robot_tasks').update({ 
        items_packed: packed 
      }).eq('id', robotTask.id);
    }

    // Send CONVEYOR START to Arduino
    hardwareBridge.conveyorStart();

    // Complete
    await supabase.from('robot_tasks').update({ 
      status: 'idle',
      completed_at: new Date().toISOString()
    }).eq('id', robotTask.id);
    
    await supabase.from('orders').update({ 
      status: 'packing',
      packed_at: new Date().toISOString()
    }).eq('id', robotTask.order_id);

    setProgress(100);
    await supabase.from('shop_status').update({ robot_status: 'idle' }).neq('id', '');
  };

  return { task, progress, startPickAndPack };
}
