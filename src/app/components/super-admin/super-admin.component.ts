import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ApiService, Lab } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { AdminComponent } from '../admin/admin.component';
import { environment } from '../../../environments/environment';

interface UserRow {
  id: number;
  username: string;
  role: string;
  adminLabId: number | string;
}

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminComponent],
  templateUrl: './super-admin.component.html',
  styleUrl: './super-admin.component.scss'
})
export class SuperAdminComponent implements OnInit {
  activeTab = 'users';

  users: UserRow[] = [];
  labs: Lab[] = [];

  userForm: any = { username: '', password: '', role: 'USER', adminLabId: '' };

  msg = ''; msgType = 'success';

  roles = ['SUPERADMIN', 'ADMIN', 'USER'];

  constructor(private api: ApiService, public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    this.loadUsers();
    this.api.getLabs().subscribe(d => this.labs = d);
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.auth.getToken()}` });
  }

  loadUsers() {
    this.http.get<any>(`${environment.apiUrl}/users`, { headers: this.headers() })
      .subscribe({ next: r => this.users = r.data, error: () => this.showMsg('Failed to load users', 'error') });
  }

  createUser() {
    const body: any = {
      username: this.userForm.username,
      password: this.userForm.password,
      role: this.userForm.role,
      adminLabId: this.userForm.role === 'ADMIN' && this.userForm.adminLabId ? this.userForm.adminLabId : null
    };
    this.http.post<any>(`${environment.apiUrl}/users`, body, { headers: this.headers() })
      .subscribe({
        next: () => {
          this.showMsg('User created!');
          this.userForm = { username: '', password: '', role: 'USER', adminLabId: '' };
          this.loadUsers();
        },
        error: e => this.showMsg(e?.error?.message || 'Error creating user', 'error')
      });
  }

  deleteUser(id: number) {
    if (!confirm('Delete this user?')) return;
    this.http.delete<any>(`${environment.apiUrl}/users/${id}`, { headers: this.headers() })
      .subscribe({ next: () => { this.users = this.users.filter(u => u.id !== id); this.showMsg('User deleted'); }, error: () => this.showMsg('Delete failed', 'error') });
  }

  updateRole(user: UserRow, newRole: string) {
    const body: any = { role: newRole };
    if (newRole !== 'ADMIN') body.adminLabId = '';
    this.http.patch<any>(`${environment.apiUrl}/users/${user.id}`, body, { headers: this.headers() })
      .subscribe({ next: () => { user.role = newRole; this.showMsg('Role updated'); }, error: () => this.showMsg('Update failed', 'error') });
  }

  updateLabId(user: UserRow, labId: string) {
    this.http.patch<any>(`${environment.apiUrl}/users/${user.id}`, { adminLabId: labId }, { headers: this.headers() })
      .subscribe({ next: () => { user.adminLabId = labId; this.showMsg('Lab assignment updated'); }, error: () => this.showMsg('Update failed', 'error') });
  }

  getLabName(labId: number | string): string {
    if (!labId) return '--';
    const lab = this.labs.find(l => l.id === Number(labId));
    return lab ? lab.name : `Lab #${labId}`;
  }

  roleClass(role: string): string {
    return role === 'SUPERADMIN' ? 'badge-super' : role === 'ADMIN' ? 'badge-admin' : 'badge-user';
  }

  showMsg(m: string, type = 'success') {
    this.msg = m; this.msgType = type;
    setTimeout(() => this.msg = '', 3500);
  }
}
