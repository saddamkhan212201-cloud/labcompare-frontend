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
          }));
          // Reload cart so the logged-in user's items are loaded
          this.cart.reloadForUser();
        })
      );
  }

  /** email is optional — passed only during registration */
  register(username: string, password: string, email?: string): Observable<any> {
    return this.http.post<ApiResp<string>>(
      `${this.base}/auth/register`,
      { username, password, email: email ?? '' }
    );
  }

  logout() {
    // Don't clear cart — it's saved per user and reloads on next login
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null { return sessionStorage.getItem(this.TOKEN_KEY); }
  isLoggedIn(): boolean     { return !!this.getToken(); }

  private getUser(): any {
    const u = sessionStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  getRole():     string | null { return this.getUser()?.role       ?? null; }
  getUsername(): string | null { return this.getUser()?.username   ?? null; }

  getAdminLabId(): number | null { return this.getUser()?.adminLabId ?? null; }

  isAdmin():        boolean { return this.getRole() === 'ADMIN'; }
  isSuperAdmin():   boolean { return this.getRole() === 'SUPERADMIN'; }
  isAdminOrSuper(): boolean { return this.isAdmin() || this.isSuperAdmin(); }
}