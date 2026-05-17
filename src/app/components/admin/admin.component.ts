import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, Lab, TestItem, PriceDTO, BookingDTO } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { TestsByCategoryPipe } from '../../pipes/tests-by-category.pipe';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, TestsByCategoryPipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit {
  activeTab = 'labs';

  labs: Lab[]            = [];
  tests: TestItem[]      = [];
  prices: PriceDTO[]     = [];
  bookings: BookingDTO[] = [];

  // ─── Forms ────────────────────────────────────────────────────────────────
  labForm:   any = { name:'', city:'', address:'', phone:'', rating:4.0, accreditation:'NABL', homeCollection:true };
  testForm:  any = { name:'', category:'', description:'' };
  priceForm: any = { labId:'', testId:'', price:'', discountPercent:0, reportDuration:'Same Day' };

  // ─── Edit state ───────────────────────────────────────────────────────────
  editingLab:   Lab      | null = null;
  editingTest:  TestItem | null = null;
  editingPrice: PriceDTO | null = null;

  // ─── Category dropdown ────────────────────────────────────────────────────
  // categorySelection is bound to the <select>.
  // When '__other__' is chosen, the free-text input is revealed and the
  // admin types directly into testForm.category.
  categorySelection = '';

  readonly categoryOptions: string[] = [
    'Blood Tests',
    'Urine Tests',
    'Stool Tests',
    'Hormone Tests',
    'Diabetes Tests',
    'Thyroid Tests',
    'Lipid Profile Tests',
    'Liver Function Tests (LFT)',
    'Kidney Function Tests (KFT)',
    'Cardiac Marker Tests',
    'Vitamin & Nutritional Tests',
    'Infection & Fever Profile Tests',
    'Allergy Tests',
    'Cancer Marker Tests',
    'Immunology Tests',
    'Serology Tests',
    'Coagulation Tests',
    'Pregnancy Tests',
    'Microbiology Tests',
    'Preventive Health Check-up Packages'
  ];

  // ─── Duplicate detection ──────────────────────────────────────────────────
  duplicateTestWarning = '';

  msg = ''; msgType = 'success';

  get restrictedLabId(): number | null { return this.auth.getAdminLabId(); }
  get isRestricted(): boolean { return this.restrictedLabId !== null; }
  get restrictedLabLabel(): string {
    const lab = this.labs.find(l => l.id === this.restrictedLabId);
    return lab ? lab.name : ('Lab #' + this.restrictedLabId);
  }
  get visibleLabs(): Lab[] {
    if (!this.isRestricted) return this.labs;
    return this.labs.filter(l => l.id === this.restrictedLabId);
  }
  get visiblePrices(): PriceDTO[] {
    if (!this.isRestricted) return this.prices;
    return this.prices.filter(p => p.labId === this.restrictedLabId);
  }
  get visibleBookings(): BookingDTO[] {
    if (!this.isRestricted) return this.bookings;
    const labName = this.labs.find(l => l.id === this.restrictedLabId)?.name;
    return labName ? this.bookings.filter(b => b.labName === labName) : this.bookings;
  }

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnInit() {
    this.loadAll();
    if (this.isRestricted) this.priceForm.labId = this.restrictedLabId;
  }

  loadAll() {
    this.api.getLabs().subscribe(d => this.labs = d);
    this.api.getTests().subscribe(d => { this.tests = d; });
    this.api.getAllPrices().subscribe(d => this.prices = d);
    this.api.getAllBookings().subscribe(d => this.bookings = d);
  }

  showMsg(m: string, type = 'success') {
    this.msg = m; this.msgType = type;
    setTimeout(() => this.msg = '', 4000);
  }

  // ─── LABS ─────────────────────────────────────────────────────────────────
  saveLab() {
    if (this.isRestricted && this.editingLab && this.editingLab.id !== this.restrictedLabId) {
      this.showMsg('You can only edit your assigned lab', 'error'); return;
    }
    if (!this.labForm.name?.trim() || !this.labForm.city?.trim()) {
      this.showMsg('Lab name and city are required', 'error'); return;
    }
    const obs = this.editingLab
      ? this.api.updateLab(this.editingLab.id, this.labForm)
      : this.api.createLab(this.labForm);
    obs.subscribe({
      next: () => {
        this.api.getLabs().subscribe(d => this.labs = d);
        this.cancelEditLab();
        this.showMsg(this.editingLab ? 'Lab updated' : 'Lab added');
      },
      error: e => this.showMsg(e?.error?.message || 'Error saving lab', 'error')
    });
  }

  editLab(lab: Lab) {
    if (this.isRestricted && lab.id !== this.restrictedLabId) {
      this.showMsg('You can only edit your assigned lab', 'error'); return;
    }
    this.editingLab = lab;
    this.labForm    = { ...lab };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteLab(id: number) {
    if (this.isRestricted) { this.showMsg('Not authorized to delete labs', 'error'); return; }
    if (!confirm('Delete this lab? This will also remove all associated prices.')) return;
    this.api.deleteLab(id).subscribe({
      next: () => { this.labs = this.labs.filter(l => l.id !== id); this.showMsg('Lab deleted'); },
      error: e => this.showMsg(e?.error?.message || 'Error deleting lab', 'error')
    });
  }

  cancelEditLab() {
    this.editingLab = null;
    this.labForm    = { name:'', city:'', address:'', phone:'', rating:4.0, accreditation:'NABL', homeCollection:true };
  }

  // ─── TESTS ────────────────────────────────────────────────────────────────

  // Called when admin picks from the <select>.
  // Known category → write to testForm.category immediately.
  // '__other__'    → clear testForm.category so admin types into revealed input.
  onCategorySelect(value: string) {
    if (value === '__other__') {
      this.testForm.category = '';
    } else {
      this.testForm.category = value;
    }
    this.checkDuplicateTest();
  }

  onTestNameInput() {
    this.checkDuplicateTest();
  }

  checkDuplicateTest() {
    const name = (this.testForm.name || '').trim().toLowerCase();
    if (!name) { this.duplicateTestWarning = ''; return; }
    const editingId = this.editingTest?.id;
    const exists    = this.tests.find(t => t.name.toLowerCase() === name && t.id !== editingId);
    this.duplicateTestWarning = exists
      ? `⚠️ A test named "${exists.name}" already exists (Category: ${exists.category})`
      : '';
  }

  saveTest() {
    if (!this.testForm.name?.trim()) { this.showMsg('Test name is required', 'error'); return; }
    if (!this.testForm.category?.trim()) { this.showMsg('Category is required', 'error'); return; }
    if (this.duplicateTestWarning && !this.editingTest) {
      this.showMsg('Cannot add: a test with this name already exists', 'error'); return;
    }

    const obs = this.editingTest
      ? this.api.updateTest(this.editingTest.id, this.testForm)
      : this.api.createTest(this.testForm);

    obs.subscribe({
      next: () => {
        this.api.getTests().subscribe(d => { this.tests = d; });
        this.cancelEditTest();
        this.showMsg(this.editingTest ? 'Test updated' : 'Test added');
      },
      error: e => {
        const msg = e?.error?.message || '';
        if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) {
          this.showMsg('A test with this name already exists', 'error');
        } else {
          this.showMsg(msg || 'Error saving test', 'error');
        }
      }
    });
  }

  editTest(test: TestItem) {
    this.editingTest          = test;
    this.testForm             = { name: test.name, category: test.category, description: test.description };
    this.duplicateTestWarning = '';
    // Pre-select dropdown: known category → select it; unknown/custom → show "Other" + text input
    this.categorySelection    = this.categoryOptions.includes(test.category) ? test.category : '__other__';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditTest() {
    this.editingTest          = null;
    this.testForm             = { name:'', category:'', description:'' };
    this.duplicateTestWarning = '';
    this.categorySelection    = '';
  }

  deleteTest(id: number) {
    if (!confirm('Delete this test? This will also remove all associated prices.')) return;
    this.api.deleteTest(id).subscribe({
      next: () => {
        this.tests  = this.tests.filter(t => t.id !== id);
        this.prices = this.prices.filter(p => p.testId !== id);
        this.showMsg('Test deleted');
      },
      error: e => this.showMsg(e?.error?.message || 'Error deleting test', 'error')
    });
  }

  // ─── PRICES ───────────────────────────────────────────────────────────────
  savePrice() {
    const labId  = this.isRestricted ? this.restrictedLabId! : Number(this.priceForm.labId);
    const testId = Number(this.priceForm.testId);
    const price  = Number(this.priceForm.price);

    if (!labId)  { this.showMsg('Please select a lab', 'error'); return; }
    if (!testId) { this.showMsg('Please select a test', 'error'); return; }
    if (!price || price <= 0) { this.showMsg('Please enter a valid price', 'error'); return; }

    if (!this.editingPrice) {
      const dup = this.prices.find(p => p.labId === labId && p.testId === testId);
      if (dup) {
        this.showMsg(`Price already set for "${dup.testName}" at "${dup.labName}". Use Edit to update it.`, 'error');
        return;
      }
    }

    const payload = {
      ...this.priceForm, labId, testId, price,
      discountPercent: Number(this.priceForm.discountPercent)
    };

    const obs = this.editingPrice
      ? this.api.updatePrice(this.editingPrice.id, payload)
      : this.api.setPrice(payload);

    obs.subscribe({
      next: () => {
        this.api.getAllPrices().subscribe(d => this.prices = d);
        this.cancelEditPrice();
        this.showMsg(this.editingPrice ? 'Price updated' : 'Price saved');
      },
      error: e => this.showMsg(e?.error?.message || 'Error saving price', 'error')
    });
  }

  editPrice(price: PriceDTO) {
    this.editingPrice = price;
    this.priceForm    = {
      labId: price.labId, testId: price.testId, price: price.price,
      discountPercent: price.discountPercent, reportDuration: price.reportDuration
    };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditPrice() {
    this.editingPrice = null;
    this.priceForm    = {
      labId: this.isRestricted ? this.restrictedLabId : '',
      testId: '', price: '', discountPercent: 0, reportDuration: 'Same Day'
    };
  }

  deletePrice(id: number) {
    if (!confirm('Delete this price entry?')) return;
    this.api.deletePrice(id).subscribe({
      next: () => { this.prices = this.prices.filter(p => p.id !== id); this.showMsg('Price deleted'); },
      error: e => this.showMsg(e?.error?.message || 'Error deleting price', 'error')
    });
  }

  // ─── BOOKINGS ─────────────────────────────────────────────────────────────
  cancelBooking(ref: string) {
    if (!confirm('Cancel this booking?')) return;
    this.api.cancelBooking(ref).subscribe({
      next: updated => { const i = this.bookings.findIndex(b => b.bookingRef === ref); if (i > -1) this.bookings[i] = updated; },
      error: e => this.showMsg(e?.error?.message || 'Error cancelling booking', 'error')
    });
  }

  statusClass(s: string) {
    return s === 'CONFIRMED' ? 'status-confirmed' : s === 'CANCELLED' ? 'status-cancelled' : 'status-completed';
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  getTestName(testId: number): string { return this.tests.find(t => t.id === testId)?.name || String(testId); }
  getLabName(labId: number):   string { return this.labs.find(l => l.id === labId)?.name   || String(labId); }
}