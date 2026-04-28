import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, BookingDTO } from '../../services/api.service';

@Component({ selector: 'app-my-bookings', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './my-bookings.component.html', styleUrl: './my-bookings.component.scss' })
export class MyBookingsComponent {
  phone = ''; bookings: BookingDTO[] = []; loading = false; searched = false; error = '';
  constructor(private api: ApiService) {}
  search() {
    if (!this.phone.match(/^[6-9]\d{9}$/)) { this.error = 'Enter valid 10-digit mobile number'; return; }
    this.error = ''; this.loading = true;
    this.api.getBookingsByPhone(this.phone).subscribe({ next: b => { this.bookings = b; this.loading = false; this.searched = true; }, error: () => { this.error = 'Failed to fetch bookings'; this.loading = false; } });
  }
  cancel(ref: string) {
    if (!confirm('Cancel this booking?')) return;
    this.api.cancelBooking(ref).subscribe({ next: updated => { const idx = this.bookings.findIndex(b => b.bookingRef === ref); if (idx > -1) this.bookings[idx] = updated; } });
  }
  statusClass(s: string) { return s === 'CONFIRMED' ? 'status-confirmed' : s === 'CANCELLED' ? 'status-cancelled' : 'status-completed'; }
}
