
import { Injectable, signal, computed } from '@angular/core';

export type Role = 'public' | 'admin' | 'sa' | 'mechanic' | 'cashier';
export type ServiceStatus = 'pending' | 'diagnosing' | 'repairing' | 'washing' | 'ready' | 'completed';
export type Dept = 'TKRO' | 'TBSM' | 'FB';

export interface User {
  id: string;
  name: string;
  role: Role;
  isBusy?: boolean; // For mechanics
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface ServiceItem {
  id: string;
  uniqueCode: string; // Generated at registration
  ownerName: string;
  plateNumber: string;
  vehicleType: string;
  dept: Dept;
  complaint: string;
  status: ServiceStatus;
  mechanicId: string | null;
  mechanicName: string | null;
  costEstimate: number;
  partsUsed: { itemId: string; name: string; qty: number; price: number }[];
  entryTime: Date;
  pickupNote: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  dept: Dept;
  stock: number;
  price: number;
  category: string; // 'Sparepart', 'Oil', 'Snack', 'Drink'
}

export interface Transaction {
  id: string;
  date: Date;
  total: number;
  items: { name: string; qty: number; price: number }[];
  type: 'Service' | 'Retail';
  refCode?: string; // Service Code or Random for Retail
}

@Injectable({
  providedIn: 'root'
})
export class WorkshopService {
  // --- State Signals ---
  
  // Current logged in user (mock)
  currentUser = signal<User | null>(null);

  // Users database
  users = signal<User[]>([
    { id: 'u1', name: 'Super Admin', role: 'admin' },
    { id: 'u2', name: 'Budi (SA)', role: 'sa' },
    { id: 'u3', name: 'Ahmad (Mekanik 1)', role: 'mechanic', isBusy: false },
    { id: 'u4', name: 'Siti (Mekanik 2)', role: 'mechanic', isBusy: true },
    { id: 'u5', name: 'Rudi (Mekanik 3)', role: 'mechanic', isBusy: false },
    { id: 'u6', name: 'Lina (Kasir)', role: 'cashier' },
  ]);

  // Inventory Database
  inventory = signal<InventoryItem[]>([
    { id: 'i1', name: 'Oli Mesin 10W-40', dept: 'TKRO', stock: 50, price: 65000, category: 'Oil' },
    { id: 'i2', name: 'Kampas Rem Avanza', dept: 'TKRO', stock: 12, price: 250000, category: 'Sparepart' },
    { id: 'i3', name: 'Oli Matic Beat', dept: 'TBSM', stock: 100, price: 45000, category: 'Oil' },
    { id: 'i4', name: 'Busi NGK', dept: 'TBSM', stock: 200, price: 15000, category: 'Sparepart' },
    { id: 'i5', name: 'Teh Botol', dept: 'FB', stock: 48, price: 5000, category: 'Drink' },
    { id: 'i6', name: 'Roti O', dept: 'FB', stock: 20, price: 12000, category: 'Snack' },
  ]);

  // Service Jobs Database
  services = signal<ServiceItem[]>([
    {
      id: 's1',
      uniqueCode: 'SRV-8821',
      ownerName: 'Pak Joko',
      plateNumber: 'AB 1234 XY',
      vehicleType: 'Toyota Avanza',
      dept: 'TKRO',
      complaint: 'Rem bunyi',
      status: 'repairing',
      mechanicId: 'u4',
      mechanicName: 'Siti (Mekanik 2)',
      costEstimate: 250000,
      partsUsed: [],
      entryTime: new Date(),
      pickupNote: 'Estimasi selesai jam 2 siang'
    },
    {
      id: 's2',
      uniqueCode: 'SRV-9901',
      ownerName: 'Mas Andi',
      plateNumber: 'AB 5555 ZZ',
      vehicleType: 'Honda Beat',
      dept: 'TBSM',
      complaint: 'Ganti Oli',
      status: 'pending',
      mechanicId: null,
      mechanicName: null,
      costEstimate: 45000,
      partsUsed: [],
      entryTime: new Date(),
      pickupNote: 'Menunggu antrian'
    }
  ]);

  notifications = signal<Notification[]>([]);
  transactions = signal<Transaction[]>([]);

  // --- Computed ---
  
  availableMechanics = computed(() => this.users().filter(u => u.role === 'mechanic' && !u.isBusy));
  
  stats = computed(() => {
    const s = this.services();
    return {
      pending: s.filter(x => x.status === 'pending').length,
      inProgress: s.filter(x => ['diagnosing', 'repairing', 'washing'].includes(x.status)).length,
      ready: s.filter(x => x.status === 'ready').length,
      completed: s.filter(x => x.status === 'completed').length
    };
  });

  myNotifications = computed(() => {
    const uid = this.currentUser()?.id;
    if (!uid) return [];
    return this.notifications().filter(n => n.userId === uid).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  });

  unreadCount = computed(() => this.myNotifications().filter(n => !n.read).length);

  // --- Actions ---

  login(role: Role) {
    const user = this.users().find(u => u.role === role);
    if (user) this.currentUser.set(user);
    else this.currentUser.set({ id: 'guest', name: 'Guest', role: 'public' });
  }

  logout() {
    this.currentUser.set(null);
  }

  addService(owner: string, plate: string, type: string, dept: Dept, complaint: string, mechanicId?: string) {
    let mechName = null;
    let status: ServiceStatus = 'pending';

    // If mechanic is pre-selected (e.g. via public booking)
    if (mechanicId) {
      const mech = this.users().find(u => u.id === mechanicId);
      if (mech && !mech.isBusy) {
        mechName = mech.name;
        status = 'diagnosing'; 
        
        // Notify Mechanic
        this.pushNotification(mechanicId, `Pelanggan Baru: ${plate} (${owner}) memilih Anda.`);
        
        // Mark mechanic as busy
        this.users.update(users => users.map(u => {
          if (u.id === mechanicId) return { ...u, isBusy: true };
          return u;
        }));
      }
    }

    const newService: ServiceItem = {
      id: Date.now().toString(),
      uniqueCode: 'SRV-' + Math.floor(1000 + Math.random() * 9000),
      ownerName: owner,
      plateNumber: plate.toUpperCase(),
      vehicleType: type,
      dept,
      complaint,
      status,
      mechanicId: mechanicId || null,
      mechanicName: mechName,
      costEstimate: 0,
      partsUsed: [],
      entryTime: new Date(),
      pickupNote: 'Dalam antrian'
    };
    this.services.update(list => [...list, newService]);
    return newService.uniqueCode;
  }

  assignMechanic(serviceId: string, mechanicId: string) {
    const mechanic = this.users().find(u => u.id === mechanicId);
    if (!mechanic) return;

    // Update service
    this.services.update(list => list.map(s => {
      if (s.id === serviceId) {
        return { ...s, mechanicId, mechanicName: mechanic.name, status: 'diagnosing' };
      }
      return s;
    }));

    // Mark mechanic as busy
    this.users.update(users => users.map(u => {
      if (u.id === mechanicId) return { ...u, isBusy: true };
      return u;
    }));

    // Notify Mechanic
    this.pushNotification(mechanicId, `Anda ditugaskan untuk service ID: ${serviceId}.`);
  }

  updateStatus(serviceId: string, status: ServiceStatus, note: string) {
    this.services.update(list => list.map(s => {
      if (s.id === serviceId) {
        // If completing, free the mechanic
        if (status === 'ready' || status === 'completed') {
           this.freeMechanic(s.mechanicId);
        }
        return { ...s, status, pickupNote: note };
      }
      return s;
    }));
  }

  freeMechanic(mechanicId: string | null) {
    if(!mechanicId) return;
    this.users.update(users => users.map(u => {
      if (u.id === mechanicId) return { ...u, isBusy: false };
      return u;
    }));
  }

  addPartToService(serviceId: string, partId: string) {
    const part = this.inventory().find(i => i.id === partId);
    if (!part || part.stock <= 0) return false;

    // Decrease stock
    this.inventory.update(inv => inv.map(i => {
      if (i.id === partId) return { ...i, stock: i.stock - 1 };
      return i;
    }));

    // Add to service bill
    this.services.update(list => list.map(s => {
      if (s.id === serviceId) {
        return {
          ...s,
          partsUsed: [...s.partsUsed, { itemId: part.id, name: part.name, qty: 1, price: part.price }]
        };
      }
      return s;
    }));
    return true;
  }

  // --- Inventory CRUD ---

  addInventoryItem(item: Omit<InventoryItem, 'id'>) {
    const newItem: InventoryItem = { ...item, id: 'i' + Date.now() };
    this.inventory.update(current => [...current, newItem]);
  }

  updateInventoryItem(id: string, updates: Partial<InventoryItem>) {
    this.inventory.update(current => current.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  }

  deleteInventoryItem(id: string) {
    this.inventory.update(current => current.filter(item => item.id !== id));
  }

  // --- Notification System ---

  pushNotification(userId: string, message: string) {
    const notif: Notification = {
      id: Date.now().toString(),
      userId,
      message,
      timestamp: new Date(),
      read: false
    };
    this.notifications.update(n => [notif, ...n]);
  }

  markRead(notifId: string) {
    this.notifications.update(n => n.map(x => x.id === notifId ? { ...x, read: true } : x));
  }

  markAllRead() {
    const uid = this.currentUser()?.id;
    if (!uid) return;
    this.notifications.update(n => n.map(x => x.userId === uid ? { ...x, read: true } : x));
  }

  // --- Transactions / POS ---

  processRetailTransaction(items: { item: InventoryItem; qty: number }[]): string {
    const total = items.reduce((acc, curr) => acc + (curr.item.price * curr.qty), 0);
    const code = 'TRX-' + Math.floor(10000 + Math.random() * 90000);
    
    // Deduct stock
    items.forEach(cartItem => {
       this.inventory.update(inv => inv.map(i => {
         if (i.id === cartItem.item.id) return { ...i, stock: i.stock - cartItem.qty };
         return i;
       }));
    });

    const transaction: Transaction = {
      id: Date.now().toString(),
      date: new Date(),
      total,
      type: 'Retail',
      items: items.map(c => ({ name: c.item.name, qty: c.qty, price: c.item.price })),
      refCode: code
    };

    this.transactions.update(t => [transaction, ...t]);
    return code;
  }

  completeServiceTransaction(service: ServiceItem, total: number) {
    const transaction: Transaction = {
      id: Date.now().toString(),
      date: new Date(),
      total,
      type: 'Service',
      items: [
         { name: `Service Jasa (${service.uniqueCode})`, qty: 1, price: 50000 }, // Mock service fee
         ...service.partsUsed.map(p => ({ name: p.name, qty: p.qty, price: p.price }))
      ],
      refCode: service.uniqueCode
    };
    this.transactions.update(t => [transaction, ...t]);
  }
}
