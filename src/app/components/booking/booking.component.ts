import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, PriceDTO, BookingDTO } from '../../services/api.service';

@Component({ selector: 'app-booking', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './booking.component.html', styleUrl: './booking.component.scss' })
export class BookingComponent implements OnInit {
  price: PriceDTO | null = null;
  step = 1;
  loading = false;
  confirmed: BookingDTO | null = null;

  // QR Code
  qrBase64: string | null = null;
  qrLoading = false;
  showQrModal = false;

  form = { patientName:'', patientAge:'', phone:'', email:'', collectionType:'HOME', collectionAddress:'', appointmentDate:'', appointmentSlot:'', paymentMethod:'UPI' };
  errors: Record<string,string> = {};

  dates: {label:string, value:string}[] = [];
  slots = ['7:00 AM','8:00 AM','9:00 AM','10:00 AM','11:00 AM','2:00 PM','3:00 PM','4:00 PM','5:00 PM'];

  constructor(private api: ApiService, private router: Router) {}

  ngOnInit() {
    const nav = window.history.state;
    if (nav?.price) { this.price = nav.price; }
    else { this.router.navigate(['/search']); return; }
    this.buildDates();
  }

  buildDates() {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
        this.step = 4;
        this.loading = false;
        this.loadQRCode(booking.bookingRef);
      },
      error: (e) => { this.errors['submit'] = e?.error?.message || 'Booking failed. Please try again.'; this.loading = false; }
    });
  }

  loadQRCode(ref: string) {
    this.qrLoading = true;
    this.api.getBookingQR(ref).subscribe({
      next: res => { this.qrBase64 = res.qrBase64; this.qrLoading = false; },
      error: () => { this.qrLoading = false; }
    });
  }

  openQrModal() { this.showQrModal = true; }
  closeQrModal() { this.showQrModal = false; }

  goSearch() { this.router.navigate(['/search']); }
  goMyBookings() { this.router.navigate(['/my-bookings']); }
}
