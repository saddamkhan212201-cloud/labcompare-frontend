import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, BookingDTO } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

export interface BookingGroup {
  bookings:        BookingDTO[];          // all bookings in this group
  isGroup:         boolean;               // true = multi-test session
  appointmentDate: string;
  appointmentSlot: string;
  labName:         string;
  patientName:     string;
  patientAge:      number;
  collectionType:  string;
  collectionAddress: string;
  paymentMethod:   string;
  totalAmount:     number;
  bookedAt:        string;               // createdAt of first booking
  status:          string;               // CANCELLED if ALL cancelled, else CONFIRMED
  allCancelled:    boolean;
}

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-bookings.component.html',
  styleUrl: './my-bookings.component.scss'
})
export class MyBookingsComponent implements OnInit {

  adminPhone = '';

  bookings: BookingDTO[]      = [];
  groups:   BookingGroup[]    = [];
  loading   = false;
  searched  = false;
  error     = '';

  // Which group has its test list expanded
  expandedIdx: number | null = null;

  constructor(
    private api:  ApiService,
    public  auth: AuthService
  ) {}

  ngOnInit() {
    if (this.auth.isAdminOrSuper()) {
      this.loadAll();
    } else {
      this.loadMyBookings();
    }
  }

  private loadMyBookings() {
    this.loading = true;
    this.error   = '';
    this.api.getMyBookings().subscribe({
      next:  b   => { this.bookings = b; this.groups = this.groupBookings(b); this.loading = false; this.searched = true; },
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

  loadAll() {
    this.loading = true;
    this.error   = '';
    this.api.getAllBookings().subscribe({
      next:  b   => { this.bookings = b; this.groups = this.groupBookings(b); this.loading = false; this.searched = true; },
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
      next:  b   => { this.bookings = b; this.groups = this.groupBookings(b); this.loading = false; this.searched = true; },
      error: ()  => { this.error = 'Failed to fetch bookings'; this.loading = false; }
    });
  }

  // ── Grouping logic ────────────────────────────────────────────────────
  // Bookings are grouped when they share the same:
  //   appointmentDate + appointmentSlot + labName + phone
  //   AND were created within 2 minutes of each other (same session)
  private groupBookings(bookings: BookingDTO[]): BookingGroup[] {
    if (!bookings.length) return [];

    // Sort by createdAt ascending so earliest is first
    const sorted = [...bookings].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const groups: BookingGroup[] = [];
    const used = new Set<number>();

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;
      const anchor = sorted[i];
      const anchorTime = new Date(anchor.createdAt).getTime();

      // Find all bookings that belong to the same session
      const members: BookingDTO[] = [anchor];
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const b = sorted[j];
        const bTime = new Date(b.createdAt).getTime();
        const withinTwoMin = Math.abs(bTime - anchorTime) <= 2 * 60 * 1000;
        const sameSlot = b.appointmentDate === anchor.appointmentDate
                      && b.appointmentSlot === anchor.appointmentSlot
                      && b.labName         === anchor.labName
                      && b.phone           === anchor.phone;
        if (withinTwoMin && sameSlot) {
          members.push(b);
          used.add(j);
        }
      }
      used.add(i);

      const allCancelled = members.every(b => b.status === 'CANCELLED');
      const anyConfirmed = members.some(b => b.status === 'CONFIRMED');

      groups.push({
        bookings:        members,
        isGroup:         members.length > 1,
        appointmentDate: anchor.appointmentDate,
        appointmentSlot: anchor.appointmentSlot,
        labName:         anchor.labName,
        patientName:     anchor.patientName,
        patientAge:      anchor.patientAge,
        collectionType:  anchor.collectionType,
        collectionAddress: anchor.collectionAddress,
        paymentMethod:   anchor.paymentMethod,
        totalAmount:     members.reduce((s, b) => s + (b.totalAmount ?? 0), 0),
        bookedAt:        anchor.createdAt,
        status:          allCancelled ? 'CANCELLED' : anyConfirmed ? 'CONFIRMED' : 'COMPLETED',
        allCancelled
      });
    }

    // Show newest first
    return groups.reverse();
  }

  toggleExpand(idx: number) {
    this.expandedIdx = this.expandedIdx === idx ? null : idx;
  }

  cancel(ref: string) {
    if (!confirm('Cancel this booking?')) return;
    this.api.cancelBooking(ref).subscribe({
      next: updated => {
        const idx = this.bookings.findIndex(b => b.bookingRef === ref);
        if (idx > -1) this.bookings[idx] = updated;
        this.groups = this.groupBookings(this.bookings);
      }
    });
  }

  cancelGroup(group: BookingGroup) {
    const confirmed = group.bookings.filter(b => b.status === 'CONFIRMED');
    if (!confirmed.length) return;
    if (!confirm(`Cancel all ${confirmed.length} test(s) in this booking?`)) return;
    let done = 0;
    confirmed.forEach(b => {
      this.api.cancelBooking(b.bookingRef).subscribe({
        next: updated => {
          const idx = this.bookings.findIndex(x => x.bookingRef === updated.bookingRef);
          if (idx > -1) this.bookings[idx] = updated;
          done++;
          if (done === confirmed.length) this.groups = this.groupBookings(this.bookings);
        }
      });
    });
  }

  statusClass(s: string) {
    return s === 'CONFIRMED' ? 'status-confirmed'
         : s === 'CANCELLED' ? 'status-cancelled'
         : 'status-completed';
  }
}