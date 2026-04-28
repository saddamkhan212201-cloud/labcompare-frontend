import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Requires user to be logged in */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

/** Requires ADMIN or SUPERADMIN role */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdminOrSuper()) return true;
  router.navigate(['/login']);
  return false;
};

/** Requires SUPERADMIN role only */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  // If admin, redirect to admin page (not login)
  if (auth.isAdmin()) { router.navigate(['/admin']); return false; }
  router.navigate(['/login']);
  return false;
};
