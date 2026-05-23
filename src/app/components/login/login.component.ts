import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

type Mode = 'login' | 'register' | 'forgot';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  mode: Mode = 'login';

  // ── Login ──────────────────────────────────────────────────────────────────
  loginEmail = '';
  loginPassword = '';

  // ── Register ───────────────────────────────────────────────────────────────
  registerEmail    = '';
  registerPassword = '';
  confirmPassword  = '';
  registerPhone    = '';

  // ── Shared UI state ────────────────────────────────────────────────────────
  error   = '';
  success = '';
  loading = false;

  // ── Forgot password ────────────────────────────────────────────────────────
  forgotEmail = '';
  otpSent     = false;
  otpCode     = '';
  newPassword = '';
  confirmNew  = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private http: HttpClient
  ) {
    // Redirect already-logged-in users straight to their landing page
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.redirectPath(this.auth.getRole() ?? '')]);
    }
  }

  private redirectPath(role: string): string {
    if (role === 'SUPERADMIN') return '/superadmin';
    if (role === 'ADMIN')      return '/admin';
    return '/search';
  }

  // ─── LOGIN ─────────────────────────────────────────────────────────────────

  private doLogin(): void {
    this.error = '';
    this.success = '';

    const email = this.loginEmail.trim().toLowerCase();
    const pass  = this.loginPassword.trim();

    if (!email) { this.error = 'Email is required.'; return; }
    if (!pass)  { this.error = 'Password is required.'; return; }

    // Accept a valid email address OR a plain alphanumeric username (for
    // seeded admin/superadmin accounts that predate email login).
    const isEmail    = /^[^@]+@[^@]+\.[^@]+$/.test(email);
    const isUsername = /^[a-zA-Z0-9_]{3,}$/.test(email);
    if (!isEmail && !isUsername) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    this.loading = true;
    this.auth.login(email, pass).subscribe({
      next: data => {
        this.loading = false;
        this.router.navigate([this.redirectPath(data.role)]);
      },
      error: e => {
        this.error   = e?.error?.message || 'Invalid email or password.';
        this.loading = false;
      }
    });
  }

  // ─── REGISTER ──────────────────────────────────────────────────────────────

  private doRegister(): void {
    this.error = '';
    this.success = '';

    const email = this.registerEmail.trim().toLowerCase();
    const pass  = this.registerPassword;
    const conf  = this.confirmPassword;
    const phone = this.registerPhone.trim();

    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      this.error = 'Please enter a valid email address.';
      return;
    }
    if (!pass || pass.length < 6) {
      this.error = 'Password must be at least 6 characters.';
      return;
    }
    if (pass !== conf) {
      this.error = 'Passwords do not match.';
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      this.error = 'Enter a valid 10-digit mobile number.';
      return;
    }

    this.loading = true;
    this.auth.register(email, pass, phone).subscribe({
      next: () => {
        // Pre-fill login email for a smooth handoff
        this.loginEmail      = email;
        this.registerEmail   = '';
        this.registerPassword = '';
        this.confirmPassword = '';
        this.registerPhone   = '';
        this.success  = 'Account created! You can now log in.';
        this.mode     = 'login';
        this.loading  = false;
      },
      error: e => {
        this.error   = e?.error?.message || 'Registration failed. Please try again.';
        this.loading = false;
      }
    });
  }

  // ─── UNIFIED SUBMIT (called by template) ───────────────────────────────────

  submit(): void {
    if (this.mode === 'login')    this.doLogin();
    else if (this.mode === 'register') this.doRegister();
  }

  // ─── MODE SWITCH ───────────────────────────────────────────────────────────

  switchMode(m: Mode): void {
    this.mode    = m;
    this.error   = '';
    this.success = '';
    this.otpSent = false;
  }

  // ─── FORGOT PASSWORD — Step 1: send OTP ────────────────────────────────────

  sendOtp(): void {
    this.error   = '';
    this.success = '';

    const email = this.forgotEmail.trim().toLowerCase();
    if (!email) { this.error = 'Please enter your email address.'; return; }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      this.error = 'Please enter a valid email address.';
      return;
    }

    this.loading = true;
    this.http
      .post<any>(`${environment.apiUrl}/auth/forgot-password`, { email })
      .subscribe({
        next: () => {
          this.loading = false;
          this.otpSent = true;
          this.success = 'OTP sent! Check your email inbox.';
        },
        error: e => {
          this.loading = false;
          this.error   = e?.error?.message || 'Could not send OTP. Please try again.';
        }
      });
  }

  // ─── FORGOT PASSWORD — Step 2: verify OTP + set new password ───────────────

  resetPassword(): void {
    this.error   = '';
    this.success = '';

    if (!this.otpCode.trim()) {
      this.error = 'Please enter the OTP from your email.'; return;
    }
    if (!this.newPassword || this.newPassword.length < 6) {
      this.error = 'New password must be at least 6 characters.'; return;
    }
    if (this.newPassword !== this.confirmNew) {
      this.error = 'Passwords do not match.'; return;
    }

    this.loading = true;
    this.http
      .post<any>(`${environment.apiUrl}/auth/reset-password`, {
        email:       this.forgotEmail.trim().toLowerCase(),
        otp:         this.otpCode.trim(),
        newPassword: this.newPassword
      })
      .subscribe({
        next: () => {
          // Pre-fill login email, then switch to login tab
          this.loginEmail  = this.forgotEmail.trim().toLowerCase();
          this.forgotEmail = '';
          this.otpCode     = '';
          this.newPassword = '';
          this.confirmNew  = '';
          this.otpSent     = false;
          this.success     = 'Password reset successful! You can now log in.';
          this.mode        = 'login';
          this.loading     = false;
        },
        error: e => {
          this.loading = false;
          this.error   = e?.error?.message || 'Invalid or expired OTP. Please try again.';
        }
      });
  }

  // ─── RESEND OTP ────────────────────────────────────────────────────────────

  resendOtp(): void {
    this.otpSent = false;
    this.success = '';
    this.error   = '';
    // sendOtp() will be triggered by the template button click
  }
}