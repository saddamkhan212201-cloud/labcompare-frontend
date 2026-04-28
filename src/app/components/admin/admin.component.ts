import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Lab, TestItem, PriceDTO, BookingDTO } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  activeTab = 'labs';

  labs: Lab[] = [];
  tests: TestItem[] = [];
  prices: PriceDTO[] = [];
  bookings: BookingDTO[] = [];

  labForm: any = { name:'', city:'', address:'', phone:'', rating:4.0, accreditation:'NABL', homeCollection:true };
  testForm: any = { name:'', category:'', description:'' };
  priceForm: any = { labId:'', testId:'', price:'', discountPercent:0, reportDuration:'Same Day' };
  editingLab: Lab | null = null;

  msg = ''; msgType = 'success';

  /** The lab this admin is restricted to. NULL = no restriction (superadmin path). */
  get restrictedLabId(): number | null { return this.auth.getAdminLabId(); }
  get isRestricted(): boolean { return this.restrictedLabId !== null; }

  get restrictedLabLabel(): string {
    const lab = this.labs.find(l => l.id === this.restrictedLabId);
    return lab ? lab.name : ('Lab #' + this.restrictedLabId);
  }

  /** Labs visible to this admin */
  get visibleLabs(): Lab[] {
    if (!this.isRestricted) return this.labs;
    return this.labs.filter(l => l.id === this.restrictedLabId);
  }

  /** Prices visible to this admin (only for their lab) */
  get visiblePrices(): PriceDTO[] {
    if (!this.isRestricted) return this.prices;
    return this.prices.filter(p => p.labId === this.restrictedLabId);
  }

  /** Bookings for this admin's lab only */
  get visibleBookings(): BookingDTO[] {
    if (!this.isRestricted) return this.bookings;
    const labName = this.labs.find(l => l.id === this.restrictedLabId)?.name;
    return labName ? this.bookings.filter(b => b.labName === labName) : this.bookings;
  }

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.loadAll();
    // Pre-fill labId if restricted
    if (this.isRestricted) {
      this.priceForm.labId = this.restrictedLabId;
    }
  }

  loadAll() {
    this.api.getLabs().subscribe(d => this.labs = d);
    this.api.getTests().subscribe(d => this.tests = d);
    this.api.getAllPrices().subscribe(d => this.prices = d);
    this.api.getAllBookings().subscribe(d => this.bookings = d);
  }

  showMsg(m: string, type = 'success') {
    this.msg = m; this.msgType = type;
    setTimeout(() => this.msg = '', 3000);
  }

  // ---- Labs ----
  saveLab() {
    // Restricted admin can only edit their own lab
    if (this.isRestricted && this.editingLab && this.editingLab.id !== this.restrictedLabId) {
      this.showMsg('You can only edit your assigned lab', 'error'); return;
    }
    const obs = this.editingLab ? this.api.updateLab(this.editingLab.id, this.labForm) : this.api.createLab(this.labForm);
    obs.subscribe({
      next: () => {
        this.api.getLabs().subscribe(d => this.labs = d);
        this.labForm = { name:'',city:'',address:'',phone:'',rating:4.0,accreditation:'NABL',homeCollection:true };
        this.editingLab = null;
        this.showMsg('Lab saved');
      },
      error: e => this.showMsg(e?.error?.message || 'Error', 'error')
    });
  }

  editLab(lab: Lab) {
    if (this.isRestricted && lab.id !== this.restrictedLabId) {
      this.showMsg('You can only edit your assigned lab', 'error'); return;
    }
    this.editingLab = lab;
    this.labForm = { ...lab };
  }

  deleteLab(id: number) {
    if (this.isRestricted) { this.showMsg('Not authorized to delete labs', 'error'); return; }
    if (!confirm('Delete lab?')) return;
    this.api.deleteLab(id).subscribe(() => {
      this.labs = this.labs.filter(l => l.id !== id);
      this.showMsg('Lab deleted');
    });
  }

  cancelEditLab() {
    this.editingLab = null;
    this.labForm = { name:'',city:'',address:'',phone:'',rating:4.0,accreditation:'NABL',homeCollection:true };
  }

  // ---- Tests ----
  saveTest() {
    this.api.createTest(this.testForm).subscribe({
      next: () => { this.api.getTests().subscribe(d => this.tests = d); this.testForm = { name:'',category:'',description:'' }; this.showMsg('Test added'); },
      error: e => this.showMsg(e?.error?.message || 'Error', 'error')
    });
  }

  deleteTest(id: number) {
    if (!confirm('Delete test?')) return;
    this.api.deleteTest(id).subscribe(() => { this.tests = this.tests.filter(t => t.id !== id); this.showMsg('Test deleted'); });
  }

  // ---- Prices ----
  savePrice() {
    const payload = {
      ...this.priceForm,
      labId: this.isRestricted ? this.restrictedLabId! : Number(this.priceForm.labId),
      testId: Number(this.priceForm.testId),
      price: Number(this.priceForm.price),
      discountPercent: Number(this.priceForm.discountPercent)
    };
    this.api.setPrice(payload).subscribe({
      next: () => {
        this.api.getAllPrices().subscribe(d => this.prices = d);
        this.priceForm = { labId: this.isRestricted ? this.restrictedLabId : '', testId:'', price:'', discountPercent:0, reportDuration:'Same Day' };
        this.showMsg('Price saved');
      },
      error: e => this.showMsg(e?.error?.message || 'Error', 'error')
    });
  }

  deletePrice(id: number) {
    if (!confirm('Delete price?')) return;
    this.api.deletePrice(id).subscribe(() => { this.prices = this.prices.filter(p => p.id !== id); this.showMsg('Price deleted'); });
  }

  cancelBooking(ref: string) {
    if (!confirm('Cancel this booking?')) return;
    this.api.cancelBooking(ref).subscribe({
      next: updated => { const i = this.bookings.findIndex(b => b.bookingRef === ref); if (i > -1) this.bookings[i] = updated; }
    });
  }

  statusClass(s: string) {
    return s === 'CONFIRMED' ? 'status-confirmed' : s === 'CANCELLED' ? 'status-cancelled' : 'status-completed';
  }
}
