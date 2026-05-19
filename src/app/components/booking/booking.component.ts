import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PriceDTO, BookingDTO } from '../../services/api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit {
  price: PriceDTO | null = null;
  step = 1;
  loading = false;
  confirmed: BookingDTO | null = null;

  // Razorpay payment state
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

  // Capture router state in constructor — getCurrentNavigation() is only valid here,
  // not in ngOnInit (by then the navigation has already completed and returns null).
  private navState: any;

  constructor(private api: ApiService, private router: Router, private zone: NgZone) {
    this.navState = this.router.getCurrentNavigation()?.extras?.state
                   ?? window.history.state;
  }

  ngOnInit() {
    if (this.navState?.price) {
      this.price = this.navState.price;
    } else {
      this.router.navigate(['/search']);
      return;
    }
    this.buildDates();
  }

  buildDates() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

  get collectionFee(): number { return this.form.collectionType === 'HOME' ? 50 : 0; }
  get total(): number { return (this.price?.effectivePrice || 0) + this.collectionFee; }

  confirm() {
    if (!this.price) return;
    this.loading = true;
    this.errors = {};
    this.paymentError = '';
    const req = {
      patientName: this.form.patientName, patientAge: Number(this.form.patientAge),
      phone: this.form.phone, email: this.form.email,
      labId: this.price.labId, testId: this.price.testId,
      collectionType: this.form.collectionType, collectionAddress: this.form.collectionAddress,
      appointmentDate: this.form.appointmentDate, appointmentSlot: this.form.appointmentSlot,
      paymentMethod: this.form.paymentMethod
    };
    this.api.createBooking(req).subscribe({
      next: booking => {
        this.confirmed = booking;
        this.loading = false;
        if (this.form.paymentMethod === 'CASH') {
          // Cash: no online payment, go straight to success screen
          this.paymentSuccess = true;
          this.step = 4;
        } else {
          // UPI / Card: open Razorpay checkout
          this.openRazorpay(booking);
        }
      },
      error: (e) => { this.errors['submit'] = e?.error?.message || 'Booking failed. Please try again.'; this.loading = false; }
    });
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

  private async openRazorpay(booking: BookingDTO) {
    this.paymentLoading = true;
    this.paymentError = '';
    try {
      // 1. Create Razorpay order on our backend
      const orderRes = await fetch(`${environment.apiUrl}/razorpay/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: this.form.patientName.trim(), userPhone: this.form.phone.trim(), amount: Math.round(this.total) })
      });
      if (!orderRes.ok) throw new Error('Could not create payment order');
      const order = await orderRes.json();

      await this.loadRazorpayScript();

      // 2. Open Razorpay checkout modal
      const options: any = {
        key: order['key'],
        amount: order['amount'],
        currency: 'INR',
        name: 'LabChain',
        description: `${booking.testName} at ${booking.labName}`,
        order_id: order['id'],
        prefill: { name: this.form.patientName.trim(), contact: this.form.phone.trim(), email: this.form.email.trim() || undefined },
        notes: { booking_ref: booking.bookingRef, test: booking.testName, lab: booking.labName },
        theme: { color: '#1D9E75' },
        handler: (response: any) => {
          this.zone.run(() => {
            this.paymentPaymentId = response.razorpay_payment_id;
            this.verifyAndFinalize(booking, response.razorpay_order_id, response.razorpay_payment_id, response.razorpay_signature);
          });
        },
        modal: {
          ondismiss: () => {
            this.zone.run(() => {
              this.paymentLoading = false;
              this.paymentError = 'Payment was cancelled. Click "Retry Payment" to try again.';
            });
          }
        }
      };
      new (window as any).Razorpay(options).open();
    } catch (err: any) {
      this.zone.run(() => { this.paymentLoading = false; this.paymentError = 'Could not open payment gateway. Please try again.'; });
    }
  }

  private async verifyAndFinalize(booking: BookingDTO, orderId: string, paymentId: string, signature: string) {
    try {
      const res = await fetch(`${environment.apiUrl}/razorpay/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature,
          userName: booking.patientName,
          userPhone: booking.phone,
          amount: Math.round(booking.totalAmount || this.total),
          tests:      [booking.testName],
          userEmail:  booking.email,        // patient's email → TO field
          // Booking context for rich team email
          bookingRef: booking.bookingRef,
          labName: booking.labName,
          appointmentDate: booking.appointmentDate,
          appointmentSlot: booking.appointmentSlot,
          collectionType: booking.collectionType,
          collectionAddress: booking.collectionAddress
        })
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Verification failed');
      this.paymentSuccess = true;
      this.paymentLoading = false;
      this.step = 4;
    } catch (err: any) {
      this.paymentLoading = false;
      this.paymentError = 'Payment received but verification failed. Contact support with Payment ID: ' + paymentId;
    }
  }

  retryPayment() {
    if (!this.confirmed) return;
    this.paymentError = '';
    this.openRazorpay(this.confirmed);
  }

  goSearch() { this.router.navigate(['/search']); }
  goMyBookings() { this.router.navigate(['/my-bookings']); }
}