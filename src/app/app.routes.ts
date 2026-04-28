import { Routes } from '@angular/router';
import { SearchComponent } from './components/search/search.component';
import { BookingComponent } from './components/booking/booking.component';
import { AdminComponent } from './components/admin/admin.component';
import { MyBookingsComponent } from './components/my-bookings/my-bookings.component';
import { LoginComponent } from './components/login/login.component';
import { SuperAdminComponent } from './components/super-admin/super-admin.component';
import { adminGuard, authGuard, superAdminGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'search',       component: SearchComponent },
  { path: 'book',         component: BookingComponent,    canActivate: [authGuard] },
  { path: 'my-bookings',  component: MyBookingsComponent, canActivate: [authGuard] },
  { path: 'admin',        component: AdminComponent,      canActivate: [adminGuard] },
  { path: 'superadmin',   component: SuperAdminComponent, canActivate: [superAdminGuard] },
  { path: 'login',        component: LoginComponent },
  { path: '**', redirectTo: 'login' }
];