
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkshopService, Role, ServiceItem, Dept, InventoryItem } from './services/workshop.service';
import { GoogleGenAI } from "@google/genai";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
})
export class AppComponent {
  ws = inject(WorkshopService);
  
  // View State
  currentView = signal<'landing' | 'dashboard' | 'pos' | 'inventory' | 'history'>('landing');
  
  // Tracking State
  trackInput = signal('');
  trackResult = signal<ServiceItem | null>(null);
  trackError = signal('');

  // Public Booking State
  bookingForm = {
    owner: '',
    plate: '',
    vehicleType: '',
    dept: 'TKRO' as Dept,
    complaint: '',
    mechanicId: ''
  };

  // SA Form State
  saForm = {
    owner: '',
    plate: '',
    type: '',
    dept: 'TKRO' as Dept,
    complaint: ''
  };

  // Inventory Management State
  showInvForm = signal(false);
  editingItem = signal<InventoryItem | null>(null);
  invForm = {
    name: '',
    dept: 'TKRO' as Dept,
    stock: 0,
    price: 0,
    category: 'Sparepart'
  };

  // POS State
  cart = signal<{ item: InventoryItem; qty: number }[]>([]);
  
  // History State
  historySearch = signal('');
  
  // Notifications
  showNotifDropdown = signal(false);

  // AI Mechanic State
  aiPrompt = signal('');
  aiResponse = signal('');
  aiLoading = signal(false);

  // Computed
  showSidebar = computed(() => this.ws.currentUser() !== null);
  activeRole = computed(() => this.ws.currentUser()?.role || 'public');
  
  cartTotal = computed(() => this.cart().reduce((acc, curr) => acc + (curr.item.price * curr.qty), 0));
  
  filteredHistory = computed(() => {
    const search = this.historySearch().toLowerCase();
    if (!search) return [];
    return this.ws.services().filter(s => 
      s.plateNumber.toLowerCase().includes(search) || 
      s.ownerName.toLowerCase().includes(search) ||
      s.uniqueCode.toLowerCase().includes(search)
    ).sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
  });

  // --- Methods ---

  handleLogin(role: Role) {
    this.ws.login(role);
    if (role === 'public') {
      this.currentView.set('landing');
    } else {
      this.currentView.set('dashboard');
    }
  }

  doTrack() {
    this.trackResult.set(null);
    this.trackError.set('');
    
    if (!this.trackInput()) {
      this.trackError.set('Masukkan Nomor Plat atau Kode Service.');
      return;
    }

    const found = this.ws.services().find(s => 
      s.plateNumber.replace(/\s/g, '').toUpperCase() === this.trackInput().replace(/\s/g, '').toUpperCase() ||
      s.uniqueCode.toUpperCase() === this.trackInput().toUpperCase()
    );

    if (found) {
      this.trackResult.set(found);
    } else {
      this.trackError.set('Data tidak ditemukan. Silakan cek kembali.');
    }
  }

  submitBooking() {
    if(!this.bookingForm.owner || !this.bookingForm.plate) {
      alert('Nama dan Plat Nomor wajib diisi');
      return;
    }
    const code = this.ws.addService(
      this.bookingForm.owner,
      this.bookingForm.plate,
      this.bookingForm.vehicleType,
      this.bookingForm.dept,
      this.bookingForm.complaint,
      this.bookingForm.mechanicId
    );
    alert(`Booking Berhasil! Kode Unik Anda: ${code}\nSimpan kode ini untuk melacak status service.`);
    
    // Reset form
    this.bookingForm = {
      owner: '',
      plate: '',
      vehicleType: '',
      dept: 'TKRO',
      complaint: '',
      mechanicId: ''
    };
  }

  submitService() {
    if(!this.saForm.owner || !this.saForm.plate) return;
    const code = this.ws.addService(
      this.saForm.owner,
      this.saForm.plate,
      this.saForm.type,
      this.saForm.dept,
      this.saForm.complaint
    );
    alert(`Service Terdaftar! Kode Unik: ${code}`);
    this.saForm = { owner: '', plate: '', type: '', dept: 'TKRO', complaint: '' };
  }

  // Inventory Logic
  openAddInv() {
    this.editingItem.set(null);
    this.invForm = { name: '', dept: 'TKRO', stock: 0, price: 0, category: 'Sparepart' };
    this.showInvForm.set(true);
  }

  openEditInv(item: InventoryItem) {
    this.editingItem.set(item);
    this.invForm = { 
      name: item.name, 
      dept: item.dept, 
      stock: item.stock, 
      price: item.price, 
      category: item.category 
    };
    this.showInvForm.set(true);
  }

  saveInventory() {
    if (!this.invForm.name) return;
    
    if (this.editingItem()) {
      this.ws.updateInventoryItem(this.editingItem()!.id, this.invForm);
    } else {
      this.ws.addInventoryItem(this.invForm);
    }
    this.showInvForm.set(false);
  }

  deleteInventory(id: string) {
    if(confirm('Hapus barang ini?')) {
      this.ws.deleteInventoryItem(id);
    }
  }

  // POS Logic
  addToCart(item: InventoryItem) {
    if (item.stock <= 0) {
      alert('Stok Habis!');
      return;
    }
    
    const currentCart = this.cart();
    const existing = currentCart.find(x => x.item.id === item.id);
    
    // Check if adding exceeds stock
    const qtyInCart = existing ? existing.qty : 0;
    if (qtyInCart + 1 > item.stock) {
      alert('Stok tidak mencukupi untuk menambah lagi.');
      return;
    }

    if (existing) {
      this.cart.update(c => c.map(x => x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x));
    } else {
      this.cart.update(c => [...c, { item, qty: 1 }]);
    }
  }

  removeFromCart(index: number) {
    this.cart.update(c => c.filter((_, i) => i !== index));
  }

  checkoutPOS() {
    if (this.cart().length === 0) return;
    const code = this.ws.processRetailTransaction(this.cart());
    alert(`Transaksi Berhasil! \nRef Code: ${code}\nTotal: Rp ${this.cartTotal().toLocaleString('id-ID')}`);
    this.cart.set([]);
  }

  async askAI() {
    if (!this.aiPrompt()) return;
    this.aiLoading.set(true);
    this.aiResponse.set('');

    try {
      const apiKey = process.env['API_KEY'];
      if(!apiKey) { throw new Error('API Key Missing'); }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const systemPrompt = `Anda adalah kepala mekanik ahli di SMK Muhammadiyah Cangkringan (TEFA). 
      Jawablah dengan bahasa Indonesia yang sopan, teknis namun mudah dimengerti, dan singkat.
      Berikan diagnosa kemungkinan kerusakan dan solusi berdasarkan keluhan kendaraan.
      Motto: Religius, Unggul, Kompeten.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: this.aiPrompt(),
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 250,
        }
      });

      this.aiResponse.set(response.text);

    } catch (err) {
      this.aiResponse.set('Maaf, sistem AI sedang tidak dapat diakses saat ini.');
      console.error(err);
    } finally {
      this.aiLoading.set(false);
    }
  }

  getServiceTotal(s: ServiceItem): number {
    const partsTotal = s.partsUsed.reduce((acc, p) => acc + p.price, 0);
    return 50000 + partsTotal; 
  }

  printReceipt(s: ServiceItem) {
    const total = this.getServiceTotal(s);
    this.ws.completeServiceTransaction(s, total);
    alert(`Mencetak Struk untuk ${s.uniqueCode}...\nTotal: Rp ${total.toLocaleString('id-ID')}`);
    this.ws.updateStatus(s.id, 'completed', 'Selesai & Lunas');
  }

  toggleNotif() {
    this.showNotifDropdown.update(v => !v);
    if (this.showNotifDropdown()) {
      this.ws.markAllRead();
    }
  }
}
