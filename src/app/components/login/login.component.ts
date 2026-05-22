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

  // Existing fields — unchanged
  username        = '';
  password        = '';
  confirmPassword = '';
  registerPhone   = '';   // required on register — linked to account permanently
  error           = '';
  success         = '';
  loading         = false;

  // Forgot password fields
  forgotEmail  = '';
  otpSent      = false;
  otpCode      = '';
  newPassword  = '';
  confirmNew   = '';

  constructor(
    private auth: AuthService,
    private router: Router,
    private http: HttpClient
  ) {
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.getRedirectPath(this.auth.getRole() || '')]);
    }
  }

  private getRedirectPath(role: string): string {
    if (role === 'SUPERADMIN') return '/superadmin';
    if (role === 'ADMIN') return '/admin';
    return '/search';
  }

  // Existing submit — completely unchanged
  submit() {
    this.error = '';
    this.success = '';
    if (!this.username.trim() || !this.password.trim()) {
      this.error = 'Username and password are required.';
      return;
    }
    if (this.mode === 'register') {
      if (this.password !== this.confirmPassword) {
        this.error = 'Passwords do not match.';
        return;
      }
      if (!this.registerPhone.match(/^[6-9]\d{9}$/)) {
        this.error = 'Enter a valid 10-digit mobile number.';
        return;
      }
      this.loading = true;
      this.auth.register(this.username, this.password, this.registerPhone).subscribe({
        next: () => {
          this.success = 'Account created! You can now log in.';
          this.mode = 'login';
          this.password = '';
          this.confirmPassword = '';
          this.loading = false;
        },
        error: e => { this.error = e?.error?.message || 'Registration failed.'; this.loading = false; }
      });
    } else {
      this.loading = true;
      this.auth.login(this.username, this.password).subscribe({
        next: data => {
          this.loading = false;
          this.router.navigate([this.getRedirectPath(data.role)]);
        },
        error: e => { this.error = e?.error?.message || 'Invalid username or password.'; this.loading = false; }
      });
    }
  }

  switchMode(m: Mode) {
    this.mode    = m;
    this.error   = '';
    this.success = '';
    this.otpSent = false;
  }

  // ─── Forgot password — Step 1: send OTP ───────────────────────────────────
  sendOtp() {
    this.error   = '';
    this.success = '';
    if (!this.forgotEmail.trim()) { this.error = 'Please enter your email address.'; return; }
    if (!this.forgotEmail.match(/^[^@]+@[^@]+\.[^@]+$/)) { this.error = 'Please enter a valid email address.'; return; }
    this.loading = true;
    this.http.post<any>(`${environment.apiUrl}/auth/forgot-password`, { email: this.forgotEmail }).subscribe({
      next: () => { this.loading = false; this.otpSent = true; this.success = 'OTP sent! Check your email inbox.'; },
      error: e => { this.loading = false; this.error = e?.error?.message || 'Could not send OTP. Please try again.'; }
    });
  }

  // ─── Forgot password — Step 2: verify OTP + reset password ───────────────
  resetPassword() {
    this.error   = '';
    this.success = '';
    if (!this.otpCode.trim())          { this.error = 'Please enter the OTP from your email.'; return; }
    if (!this.newPassword.trim())       { this.error = 'Please enter a new password.'; return; }
    if (this.newPassword.length < 6)    { this.error = 'Password must be at least 6 characters.'; return; }
    if (this.newPassword !== this.confirmNew) { this.error = 'Passwords do not match.'; return; }
    this.loading = true;
    this.http.post<any>(`${environment.apiUrl}/auth/reset-password`, {
      email:       this.forgotEmail,
      otp:         this.otpCode.trim(),
      newPassword: this.newPassword
    }).subscribe({
      next: () => {
        this.loading     = false;
        this.success     = 'Password reset successful! You can now log in.';
        this.mode        = 'login';
        this.otpSent     = false;
        this.forgotEmail = '';
        this.otpCode     = '';
        this.newPassword = '';
        this.confirmNew  = '';
      },
      error: e => { this.loading = false; this.error = e?.error?.message || 'Invalid or expired OTP. Please try again.'; }
    });
  }
}