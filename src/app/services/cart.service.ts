import { Injectable } from '@angular/core';
import { CartItem } from '../components/search/search.component';

const CART_KEY = 'labchain_cart';

@Injectable({ providedIn: 'root' })
export class CartService {

  private _items: CartItem[] = [];

  constructor() {
    this._load();
  }

  get items(): CartItem[] { return this._items; }
  get count(): number { return this._items.length; }
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

  // Call ONLY after booking is confirmed (step 4). NOT on logout or navigate away.
  clearAfterBooking(): void {
    this._items = [];
    this._save();
  }

  private _save(): void {
    try { localStorage.setItem(CART_KEY, JSON.stringify(this._items)); } catch { }
  }

  private _load(): void {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) this._items = JSON.parse(raw) as CartItem[];
    } catch { this._items = []; }
  }
}
