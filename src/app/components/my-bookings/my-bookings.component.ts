import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, BookingDTO } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.scss'
})
export class MyBookingsComponent implements OnInit {

  // Admin search (only shown to ADMIN / SUPERADMIN)
  adminPhone = '';

  bookings: BookingDTO[] = [];
  loading   = false;
  searched  = false;
  error     = '';

  constructor(
    private api:  ApiService,
    public  auth: AuthService
  ) {}

  ngOnInit() {
    if (this.auth.isAdminOrSuper()) {
      // Admin: show all bookings immediately on open
      this.loadAll();
    } else {
      // Regular USER: auto-load using phone stored in their session (from JWT)
      // They never type their phone — backend enforces it anyway
      this.loadMyBookings();
    }
  }

  // ── Regular user: load own bookings automatically ──────────────────────
  private loadMyBookings() {
    this.loading = true;
    this.error   = '';
    // No phone param needed — backend reads phone from JWT
    this.api.getMyBookings().subscribe({
      next:  b   => { this.bookings = b; this.loading = false; this.searched = true; },
      error: err => {
        this.loading = false;
        this.searched = true;
        if (err?.status === 403)
          this.error = 'Your account has no phone linked. Please contact support.';
        else
          this.error = 'Failed to load bookings. Please try again.';
      }
    });
  }

  // ── Admin: search by phone OR load all ────────────────────────────────
  loadAll() {
    this.loading = true;
    this.error   = '';
    this.api.getAllBookings().subscribe({
      next:  b   => { this.bookings = b; this.loading = false; this.searched = true; },
      error: ()  => { this.error = 'Failed to load bookings'; this.loading = false; }
    });
  }

  searchByPhone() {
    if (!this.adminPhone.match(/^[6-9]\d{9}$/)) {
      this.error = 'Enter valid 10-digit mobile number';
      return;
    }
    this.error   = '';
    this.loading = true;
    this.api.getBookingsByPhone(this.adminPhone).subscribe({
      next:  b   => { this.bookings = b; this.loading = false; this.searched = true; },
      error: ()  => { this.error = 'Failed to fetch bookings'; this.loading = false; }
    });
  }

  cancel(ref: string) {
    if (!confirm('Cancel this booking?')) return;
    this.api.cancelBooking(ref).subscribe({
      next: updated => {
        const idx = this.bookings.findIndex(b => b.bookingRef === ref);
        if (idx > -1) this.bookings[idx] = updated;
      }
    });
  }

  statusClass(s: string) {
    return s === 'CONFIRMED' ? 'status-confirmed'
         : s === 'CANCELLED' ? 'status-cancelled'
         : 'status-completed';
  }
}
