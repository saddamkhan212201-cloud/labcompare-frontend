import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface LoginResponse { token: string; username: string; role: string; adminLabId: number | null; }
interface ApiResp<T> { success: boolean; message: string; data: T; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private base = environment.apiUrl;
  private TOKEN_KEY = 'lc_token';
  private USER_KEY  = 'lc_user';

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<ApiResp<LoginResponse>>(`${this.base}/auth/login`, { username, password }).pipe(
      map(r => r.data),
      tap(data => {
        localStorage.setItem(this.TOKEN_KEY, data.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify({
          username: data.username,
          role: data.role,
          adminLabId: data.adminLabId ?? null
        }));
      })
    );
  }

  register(username: string, password: string): Observable<any> {
    return this.http.post<ApiResp<string>>(`${this.base}/auth/register`, { username, password });
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null { return localStorage.getItem(this.TOKEN_KEY); }

  isLoggedIn(): boolean { return !!this.getToken(); }

  private getUser(): any {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  }

  getRole(): string | null { return this.getUser()?.role ?? null; }
  getUsername(): string | null { return this.getUser()?.username ?? null; }

  /** The lab ID this admin manages. NULL = unrestricted (superadmin / generic admin). */
  getAdminLabId(): number | null { return this.getUser()?.adminLabId ?? null; }

  isAdmin(): boolean     { return this.getRole() === 'ADMIN'; }
  isSuperAdmin(): boolean { return this.getRole() === 'SUPERADMIN'; }
  isAdminOrSuper(): boolean { return this.isAdmin() || this.isSuperAdmin(); }
}
