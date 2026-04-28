import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  mode: 'login' | 'register' = 'login';
  username = '';
  password = '';
  confirmPassword = '';
  error = '';
  success = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) {
    // Already logged in -> redirect to appropriate page
    if (this.auth.isLoggedIn()) {
      this.router.navigate([this.getRedirectPath(this.auth.getRole() || '')]);
    }
  }

  private getRedirectPath(role: string): string {
    if (role === 'SUPERADMIN') return '/superadmin';
    if (role === 'ADMIN') return '/admin';
    return '/search';
  }

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
      this.loading = true;
      this.auth.register(this.username, this.password).subscribe({
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

  switchMode(m: 'login' | 'register') {
    this.mode = m;
    this.error = '';
    this.success = '';
  }
}
