// working 100% only did int had pictures in the product cards 
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Store, ShoppingCart, Package, AlertTriangle, TrendingUp, 
  Users, DollarSign, Bot, Shield, Settings, Power, RefreshCw,
  Bell, Camera, Flame, Lock, Eye, Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Order, Product, SecurityAlert, ShopStatus } from '@/types/shop';
import { useShopStatus, useOrders, useProducts } from '@/hooks/useShop';
import { InventoryManager } from '@/components/admin/InventoryManager';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
  const { shopStatus, updateStatus } = useShopStatus();
  const { orders } = useOrders();
  const { products, refetch: refetchProducts } = useProducts();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    activeSession: false,
    lowStockCount: 0
  });

  useEffect(() => {
    fetchAlerts();
    calculateStats();
    
    const channel = supabase
      .channel('admin_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_alerts' }, () => fetchAlerts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orders, products, shopStatus]);

  const fetchAlerts = async () => {
    const { data } = await supabase
      .from('security_alerts')
      .select('*')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) setAlerts(data as SecurityAlert[]);
  };

  const calculateStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.created_at.startsWith(today));
    const todayRevenue = todayOrders
      .filter(o => o.payment_verified)
      .reduce((sum, o) => sum + o.total_amount, 0);
    const lowStockCount = products.filter(p => p.stock_quantity <= (p.min_stock_threshold || 5)).length;

    setStats({
      todayOrders: todayOrders.length,
      todayRevenue,
      activeSession: !!shopStatus?.current_session_id,
      lowStockCount
    });
  };

  const handleEmergencyShutdown = async () => {
    await updateStatus({ 
      is_open: false, 
      emergency_mode: true,
      door_locked: true
    });
    
    await supabase.from('security_alerts').insert({
      alert_type: 'system',
      severity: 'critical',
      message: 'Emergency shutdown activated by admin'
    });
  };

  const handleReopen = async () => {
    await updateStatus({ 
      is_open: true, 
      emergency_mode: false,
      door_locked: false
    });
  };

  const acknowledgeAlert = async (alertId: string) => {
    await supabase
      .from('security_alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);
    fetchAlerts();
  };

  const triggerTestAlert = async (type: 'fire' | 'theft' | 'tamper') => {
    await supabase.from('security_alerts').insert({
      alert_type: type,
      severity: type === 'fire' ? 'critical' : 'high',
      message: `TEST: ${type.charAt(0).toUpperCase() + type.slice(1)} detected - This is a test alert`
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive';
      case 'high': return 'bg-warning';
      case 'medium': return 'bg-accent';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Store className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-3xl font-orbitron text-glow">Admin Dashboard</h1>
            <p className="text-muted-foreground">AutoShop Control Center</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              View Kiosk
            </Button>
          </Link>
          {shopStatus?.is_open ? (
            <Button variant="destructive" onClick={handleEmergencyShutdown}>
              <Power className="w-4 h-4 mr-2" />
              Emergency Shutdown
            </Button>
          ) : (
            <Button className="glow-success" onClick={handleReopen}>
              <Power className="w-4 h-4 mr-2" />
              Reopen Shop
            </Button>
          )}
        </div>
      </header>

      {/* Status bar */}
      <div className="glass rounded-xl p-4 mb-6 flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${shopStatus?.is_open ? 'bg-success animate-pulse' : 'bg-destructive'}`} />
          <span>{shopStatus?.is_open ? 'Shop Open' : 'Shop Closed'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className={`w-4 h-4 ${shopStatus?.door_locked ? 'text-warning' : 'text-muted-foreground'}`} />
          <span>Door: {shopStatus?.door_locked ? 'Locked' : 'Unlocked'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Bot className={`w-4 h-4 ${shopStatus?.robot_status === 'idle' ? 'text-success' : 'text-primary animate-robot-move'}`} />
          <span>Robot: {shopStatus?.robot_status}</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 ${stats.activeSession ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <span>{stats.activeSession ? 'Customer Active' : 'No Customer'}</span>
        </div>
        {shopStatus?.emergency_mode && (
          <Badge variant="destructive" className="animate-pulse">
            EMERGENCY MODE
          </Badge>
        )}
        {shopStatus?.fire_alarm && (
          <Badge variant="destructive" className="animate-pulse">
            <Flame className="w-4 h-4 mr-1" />
            FIRE ALARM
          </Badge>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="glass border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Today's Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-orbitron text-primary">{stats.todayOrders}</p>
          </CardContent>
        </Card>

        <Card className="glass border-success/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Today's Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-orbitron text-success">
              KES {stats.todayRevenue.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card className="glass border-accent/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4" />
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-orbitron text-accent">{products.length}</p>
          </CardContent>
        </Card>

        <Card className={`glass ${stats.lowStockCount > 0 ? 'border-warning/50' : 'border-muted/20'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Low Stock Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-orbitron ${stats.lowStockCount > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
              {stats.lowStockCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="glass">
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        {/* Orders tab */}
        <TabsContent value="orders">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                Recent Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orders.slice(0, 10).map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between bg-muted/50 rounded-lg p-4"
                  >
                    <div>
                      <p className="font-mono text-sm text-muted-foreground">
                        {order.id.slice(0, 8)}...
                      </p>
                      <p className="font-semibold">KES {order.total_amount.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge 
                        variant={order.status === 'delivered' ? 'default' : 'secondary'}
                        className={order.status === 'delivered' ? 'bg-success' : ''}
                      >
                        {order.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </motion.div>
                ))}
                {orders.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No orders yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory tab */}
        <TabsContent value="inventory">
          <InventoryManager products={products} onRefresh={refetchProducts} />
        </TabsContent>

        {/* Security tab */}
        <TabsContent value="security">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Alerts */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-warning" />
                  Active Alerts ({alerts.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`rounded-lg p-4 ${getSeverityColor(alert.severity)}/20 border border-${alert.severity === 'critical' ? 'destructive' : 'warning'}/50`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={getSeverityColor(alert.severity)}>
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <span className="text-sm font-medium">{alert.alert_type}</span>
                          </div>
                          <p>{alert.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="w-12 h-12 mx-auto mb-2 text-success" />
                      <p>No active alerts</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Test alerts */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-muted-foreground" />
                  Security Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Trigger Test Alerts</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => triggerTestAlert('fire')}
                    >
                      <Flame className="w-4 h-4 mr-1 text-destructive" />
                      Fire
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => triggerTestAlert('theft')}
                    >
                      <AlertTriangle className="w-4 h-4 mr-1 text-warning" />
                      Theft
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => triggerTestAlert('tamper')}
                    >
                      <Shield className="w-4 h-4 mr-1 text-accent" />
                      Tamper
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Manual Controls</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      onClick={() => updateStatus({ door_locked: !shopStatus?.door_locked })}
                    >
                      <Lock className="w-4 h-4 mr-1" />
                      {shopStatus?.door_locked ? 'Unlock Door' : 'Lock Door'}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => updateStatus({ fire_alarm: !shopStatus?.fire_alarm })}
                    >
                      <Flame className="w-4 h-4 mr-1" />
                      {shopStatus?.fire_alarm ? 'Reset Fire Alarm' : 'Test Fire Alarm'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Monitoring tab */}
        <TabsContent value="monitoring">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* CCTV placeholder */}
            {[1, 2, 3, 4].map((cam) => (
              <Card key={cam} className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Camera {cam}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 scanlines" />
                    <div className="text-center">
                      <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Live Feed</p>
                    </div>
                    <div className="absolute top-2 right-2">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-xs">REC</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
