import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { CartService } from './cart.service';

export interface LoginResponse {
  token:      string;
  username:   string;
  role:       string;
  adminLabId: number | null;
  phone:      string | null;
}

interface ApiResp<T> { success: boolean; message: string; data: T; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base      = environment.apiUrl;
  private TOKEN_KEY = 'lc_token';
  private USER_KEY  = 'lc_user';

  constructor(private http: HttpClient, private cart: CartService) {}

  /**
   * Login with email + password.
   *
   * Sends { email, password } — the backend resolves by email for regular
   * user accounts and falls back to username for legacy admin/superadmin
   * accounts. No change needed on the frontend for admin logins: the
   * admin's username is accepted server-side via the email field as a
   * username fallback.
   */
  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<ApiResp<LoginResponse>>(`${this.base}/auth/login`, { email, password })
      .pipe(
        map(r => r.data),
        tap(data => {
          sessionStorage.setItem(this.TOKEN_KEY, data.token);
          sessionStorage.setItem(this.USER_KEY, JSON.stringify({
            username:   data.username,
            role:       data.role,
            adminLabId: data.adminLabId ?? null,
            phone:      data.phone      ?? null,
          }));
          this.cart.reloadForUser();
        })
      );
  }

  /**
   * Register with email + password + phone.
   * Username is derived server-side from the email local-part.
   */
  register(email: string, password: string, phone: string): Observable<any> {
    return this.http.post<ApiResp<string>>(
      `${this.base}/auth/register`,
      { email, password, phone }
    );
  }

  /** Step 1: request OTP to be sent to the registered email */
  forgotPassword(email: string): Observable<any> {
    return this.http.post<ApiResp<string>>(
      `${this.base}/auth/forgot-password`, { email }
    );
  }

  /** Step 2: submit OTP + new password */
  resetPassword(email: string, otp: string, newPassword: string): Observable<any> {
    return this.http.post<ApiResp<string>>(
      `${this.base}/auth/reset-password`, { email, otp, newPassword }
    );
  }

  logout() {
    this.cart.clearForLogout();
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null { return sessionStorage.getItem(this.TOKEN_KEY); }
  isLoggedIn(): boolean     { return !!this.getToken(); }

  private getUser(): any {
    const u = sessionStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  getRole():       string | null { return this.getUser()?.role       ?? null; }
  getUsername():   string | null { return this.getUser()?.username   ?? null; }
  getAdminLabId(): number | null { return this.getUser()?.adminLabId ?? null; }
  getPhone():      string | null { return this.getUser()?.phone      ?? null; }

  isAdmin():        boolean { return this.getRole() === 'ADMIN'; }
  isSuperAdmin():   boolean { return this.getRole() === 'SUPERADMIN'; }
  isAdminOrSuper(): boolean { return this.isAdmin() || this.isSuperAdmin(); }
}