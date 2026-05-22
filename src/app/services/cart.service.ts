import { Injectable } from '@angular/core';
import { CartItem } from '../components/search/search.component';

const CART_PREFIX = 'labchain_cart_';

@Injectable({ providedIn: 'root' })
export class CartService {

  private _items: CartItem[] = [];

  constructor() {
    this._load();
  }

  // ── Key is based on username stored in sessionStorage directly ──────────
  // This avoids circular dependency with AuthService and works immediately
  // on page load since sessionStorage is already populated from previous login.
  private get _key(): string {
    try {
      const raw = sessionStorage.getItem('lc_user');
      if (raw) {
        const user = JSON.parse(raw);
        if (user?.username) return `${CART_PREFIX}${user.username}`;
      }
    } catch { }
    return `${CART_PREFIX}guest`;
  }

  get items(): CartItem[] { return this._items; }
  get count(): number     { return this._items.length; }
  get total(): number {
    return this._items.reduce((s, c) => s + c.price.effectivePrice, 0);
  }

  isInCart(priceId: number): boolean {
    return this._items.some(c => c.price.id === priceId);
  }

  testHasCartItem(testId: number): boolean {
    return this._items.some(c => c.price.testId === testId);
  }

  add(item: CartItem): void {
    if (this.isInCart(item.price.id)) return;
    const idx = this._items.findIndex(c => c.price.testId === item.price.testId);
    if (idx > -1) {
      this._items[idx] = item;
    } else {
      this._items.push(item);
    }
    this._save();
  }

  remove(priceId: number): void {
    this._items = this._items.filter(c => c.price.id !== priceId);
    this._save();
  }

  // Call ONLY after booking is confirmed. NOT on logout.
  clearAfterBooking(): void {
    this._items = [];
    this._save();
  }

  // Called after login so the correct user's cart loads from localStorage
  reloadForUser(): void {
    this._load();
  }

  private _save(): void {
    try { localStorage.setItem(this._key, JSON.stringify(this._items)); } catch { }
  }

  private _load(): void {
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) this._items = JSON.parse(raw) as CartItem[];
      else this._items = [];
    } catch { this._items = []; }
  }
}