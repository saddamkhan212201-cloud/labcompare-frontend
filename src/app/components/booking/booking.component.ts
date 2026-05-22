import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PriceDTO, BookingDTO, BookingRequest } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';
import { CartItem } from '../search/search.component';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit {
  price: PriceDTO | null = null;
  cartItems: CartItem[] = [];
  get isCartMode(): boolean { return this.cartItems.length > 1; }

  step = 1;
  loading = false;
  confirmed: BookingDTO[] = [];

  paymentLoading = false;
  paymentSuccess = false;
  paymentError = '';
  paymentPaymentId = '';

  form = {
    patientName: '', patientAge: '', phone: '', email: '',
    collectionType: 'HOME', collectionAddress: '',
    appointmentDate: '', appointmentSlot: '', paymentMethod: 'UPI'
  };
  errors: Record<string, string> = {};

  dates: { label: string; value: string }[] = [];
  slots = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];

  private navState: any;

  constructor(
    private api: ApiService,
    private router: Router,
    private zone: NgZone,
    private cartSvc: CartService,
    private auth: AuthService
  ) {
    this.navState = this.router.getCurrentNavigation()?.extras?.state ?? window.history.state;
  }

  ngOnInit() {
    // Always pre-fill phone from the logged-in user's JWT so bookings are
    // always saved with the same phone that's in the token — "My Bookings"
    // queries by this phone, so they must match.
    const sessionPhone = this.auth.getPhone();
    if (sessionPhone) this.form.phone = sessionPhone;

    if (this.navState?.price) {
      this.price     = this.navState.price;
      this.cartItems = [{ price: this.navState.price, testName: this.navState.price.testName }];
    } else if (this.navState?.cartItems?.length) {
      this.cartItems = this.navState.cartItems;
      this.price     = this.cartItems[0].price;
    } else if (this.cartSvc.count > 0) {
      this.cartItems = this.cartSvc.items;
      this.price     = this.cartItems[0].price;
    } else {
      this.router.navigate(['/search']);
      return;
    }
    this.buildDates();
  }

  buildDates() {
    const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 1; i <= 8; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      this.dates.push({ label: `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`, value: d.toISOString().split('T')[0] });
    }
  }

  validateStep1(): boolean {
    this.errors = {};
    if (!this.form.patientName.trim()) this.errors['name'] = 'Name is required';
    if (!this.form.phone.match(/^[6-9]\d{9}$/)) this.errors['phone'] = 'Enter valid 10-digit mobile number';
    if (this.form.email && !this.form.email.match(/^[^@]+@[^@]+\.[^@]+$/)) this.errors['email'] = 'Enter valid email';
    if (this.form.collectionType === 'HOME' && !this.form.collectionAddress.trim()) this.errors['address'] = 'Address required for home collection';
    return Object.keys(this.errors).length === 0;
  }

  validateStep2(): boolean {
    this.errors = {};
    if (!this.form.appointmentDate) this.errors['date'] = 'Select a date';
    if (!this.form.appointmentSlot) this.errors['slot'] = 'Select a time slot';
    return Object.keys(this.errors).length === 0;
  }

  next() { if (this.step === 1 && this.validateStep1()) this.step = 2; else if (this.step === 2 && this.validateStep2()) this.step = 3; }
  back() { this.step = Math.max(1, this.step - 1); }

  addMoreTests() { this.router.navigate(['/search']); }

  get collectionFee(): number { return this.form.collectionType === 'HOME' ? 50 : 0; }
  get total(): number { return this.cartItems.reduce((s, c) => s + c.price.effectivePrice, 0) + this.collectionFee; }
  get firstConfirmed(): BookingDTO | null { return this.confirmed[0] ?? null; }

  confirm() {
    this.loading = true;
    this.errors  = {};
    this.paymentError = '';
    const requests: BookingRequest[] = this.cartItems.map(item => ({
      patientName:       this.form.patientName,
      patientAge:        Number(this.form.patientAge),
      phone:             this.form.phone,
      email:             this.form.email,
      labId:             item.price.labId,
      testId:            item.price.testId,
      collectionType:    this.form.collectionType,
      collectionAddress: this.form.collectionAddress,
      appointmentDate:   this.form.appointmentDate,
      appointmentSlot:   this.form.appointmentSlot,
      paymentMethod:     this.form.paymentMethod
    }));
    this.bookSequentially(requests, 0, []);
  }

  private bookSequentially(requests: BookingRequest[], i: number, done: BookingDTO[]) {
    if (i >= requests.length) {
      this.confirmed = done;
      this.loading   = false;
      if (this.form.paymentMethod === 'CASH') {
        // ALL bookings are saved — send ONE combined email for everything
        this.sendCashEmail(done);
        this.paymentSuccess = true;
        this.step = 4;
        this.cartSvc.clearAfterBooking();
      } else {
        this.openRazorpay(done);
      }
      return;
    }
    this.api.createBooking(requests[i]).subscribe({
      next:  b   => this.bookSequentially(requests, i + 1, [...done, b]),
      error: err => { this.errors['submit'] = err?.error?.message || 'Booking failed. Please try again.'; this.loading = false; }
    });
  }

  /**
   * ONE email for the entire cart — called only after all bookings are saved.
   * Hits /api/bookings/cash-notify (a dedicated endpoint) so the backend
   * never touches HMAC verification for cash flows.
   */
  private async sendCashEmail(bookings: BookingDTO[]) {
    try {
      const first = bookings[0];
      await fetch(`${environment.apiUrl}/bookings/cash-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName:         this.form.patientName,
          userPhone:        this.form.phone,
          userEmail:        this.form.email,
          amount:           Math.round(this.total),
          tests:            bookings.map(b => b.testName),
          bookingRefs:      bookings.map(b => b.bookingRef).join(', '),
          labNames:         [...new Set(bookings.map(b => b.labName))].join(', '),
          appointmentDate:  first.appointmentDate,
          appointmentSlot:  first.appointmentSlot,
          collectionType:   first.collectionType,
          collectionAddress: first.collectionAddress
        })
      });
    } catch { /* email failure never blocks the UI */ }
  }

  private loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Razorpay) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Razorpay script failed to load'));
      document.body.appendChild(s);
    });
  }

  private async openRazorpay(bookings: BookingDTO[]) {
    this.paymentLoading = true;
    this.paymentError   = '';
    try {
      const orderRes = await fetch(`${environment.apiUrl}/razorpay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: this.form.patientName.trim(), userPhone: this.form.phone.trim(), amount: Math.round(this.total) })
      });
      if (!orderRes.ok) throw new Error('Could not create payment order');
      const order = await orderRes.json();
      await this.loadRazorpayScript();

      const first     = bookings[0];
      const testNames = bookings.map(b => b.testName).join(', ');

      const options: any = {
        key:         order['key'],
        amount:      order['amount'],
        currency:    'INR',
        name:        'LabChain',
        description: bookings.length === 1 ? `${first.testName} at ${first.labName}` : `${bookings.length} tests — ${testNames}`,
        order_id:    order['id'],
        prefill: { name: this.form.patientName.trim(), contact: this.form.phone.trim(), email: this.form.email.trim() || undefined },
        notes: { booking_refs: bookings.map(b => b.bookingRef).join(', '), tests: testNames },
        theme: { color: '#1D9E75' },
        handler: (response: any) => {
          this.zone.run(() => {
            this.paymentPaymentId = response.razorpay_payment_id;
            this.verifyAndFinalize(bookings, response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          });
        },
        modal: {
          ondismiss: () => {
            this.zone.run(() => { this.paymentLoading = false; this.paymentError = 'Payment was cancelled. Click "Retry Payment" to try again.'; });
          }
        }
      };
      new (window as any).Razorpay(options).open();
    } catch {
      this.zone.run(() => { this.paymentLoading = false; this.paymentError = 'Could not open payment gateway. Please try again.'; });
    }
  }

  private async verifyAndFinalize(bookings: BookingDTO[], orderId: string, paymentId: string, signature: string) {
    try {
      const first = bookings[0];
      const res   = await fetch(`${environment.apiUrl}/razorpay/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id:   orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature:  signature,
          userName:            this.form.patientName,
          userPhone:           this.form.phone,
          amount:              Math.round(this.total),
          tests:               bookings.map(b => b.testName),
          userEmail:           first.email,
          bookingRef:          bookings.map(b => b.bookingRef).join(', '),
          labName:             [...new Set(bookings.map(b => b.labName))].join(', '),
          appointmentDate:     first.appointmentDate,
          appointmentSlot:     first.appointmentSlot,
          collectionType:      first.collectionType,
          collectionAddress:   first.collectionAddress
        })
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Verification failed');
      this.paymentSuccess = true;
      this.paymentLoading = false;
      this.step = 4;
      this.cartSvc.clearAfterBooking();
    } catch {
      this.paymentLoading = false;
      this.paymentError = 'Payment received but verification failed. Contact support with Payment ID: ' + paymentId;
    }
  }

  retryPayment() {
    if (!this.confirmed.length) return;
    this.paymentError = '';
    this.openRazorpay(this.confirmed);
  }

  goSearch()     { this.router.navigate(['/search']); }
  goMyBookings() { this.router.navigate(['/my-bookings']); }
}