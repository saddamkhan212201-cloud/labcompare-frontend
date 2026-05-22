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
  phone:      string | null;   // ← new: returned on login, stored in session
}

interface ApiResp<T> { success: boolean; message: string; data: T; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base      = environment.apiUrl;
  private TOKEN_KEY = 'lc_token';
  private USER_KEY  = 'lc_user';

  constructor(private http: HttpClient, private cart: CartService) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<ApiResp<LoginResponse>>(`${this.base}/auth/login`, { username, password })
      .pipe(
        map(r => r.data),
        tap(data => {
          sessionStorage.setItem(this.TOKEN_KEY, data.token);
          sessionStorage.setItem(this.USER_KEY, JSON.stringify({
            username:   data.username,
            role:       data.role,
            adminLabId: data.adminLabId ?? null,
            phone:      data.phone      ?? null,   // ← store phone
          }));
          this.cart.reloadForUser();
        })
      );
  }

  register(username: string, password: string, phone: string, email?: string): Observable<any> {
    return this.http.post<ApiResp<string>>(
      `${this.base}/auth/register`,
      { username, password, phone, email: email ?? '' }
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post<ApiResp<string>>(`${this.base}/auth/forgot-password`, { email });
  }

  resetPassword(email: string, otp: string, newPassword: string): Observable<any> {
    return this.http.post<ApiResp<string>>(`${this.base}/auth/reset-password`, { email, otp, newPassword });
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