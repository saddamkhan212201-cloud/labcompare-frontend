import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, TestItem, PriceDTO } from '../../services/api.service';
import { CartService } from '../../services/cart.service';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { PrescriptionComponent } from '../prescription/prescription.component';

export interface CartItem {
  price: PriceDTO;
  testName: string;
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PrescriptionComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
})
export class SearchComponent implements OnInit {
  activeTab: 'search' | 'prescription' = 'search';

  tests: TestItem[] = [];
  prices: PriceDTO[] = [];
  categories: string[] = [];
  selectedCategory = 'All';
  searchQuery = '';
  cityFilter = '';
  sortBy = 'price-asc';
  selectedTestId: number | null = null;
  selectedTestName = '';
  loading = false;
  private search$ = new Subject<{q:string,cat:string}>();

  showCart = false;

  constructor(private api: ApiService, private router: Router, public cartSvc: CartService) {}

  ngOnInit() {
    this.loadTests();
    this.search$.pipe(
      debounceTime(350),
      distinctUntilChanged((a,b) => a.q===b.q && a.cat===b.cat),
      switchMap(({q,cat}) => {
        const category = cat !== 'All' ? cat : undefined;
        return this.api.getTests(q || undefined, category);
      })
    ).subscribe(tests => {
      this.tests = tests;
      this.categories = ['All', ...new Set(tests.map(t => t.category))];
    });
  }

  loadTests() {
    this.loading = true;
    this.api.getTests().subscribe({
      next: tests => {
        this.tests = tests;
        this.categories = ['All', ...new Set(tests.map(t => t.category))];
        this.loading = false;
        if (tests.length) this.selectTest(tests[0]);
      },
      error: () => this.loading = false
    });
  }

  onSearch() { this.search$.next({q: this.searchQuery, cat: this.selectedCategory}); }
  setCategory(cat: string) { this.selectedCategory = cat; this.onSearch(); }

  selectTest(test: TestItem) {
    this.selectedTestId   = test.id;
    this.selectedTestName = test.name;
    this.loading = true;
    this.api.searchPrices(test.id, this.cityFilter || undefined).subscribe({
      next: prices => { this.prices = prices; this.loading = false; },
      error: () => this.loading = false
    });
  }

  onCityChange() {
    if (this.selectedTestId) {
      this.api.searchPrices(this.selectedTestId, this.cityFilter || undefined)
        .subscribe(prices => this.prices = prices);
    }
  }

  get sortedPrices(): PriceDTO[] {
    const p = [...this.prices];
    switch (this.sortBy) {
      case 'price-asc':  return p.sort((a,b) => a.effectivePrice - b.effectivePrice);
      case 'price-desc': return p.sort((a,b) => b.effectivePrice - a.effectivePrice);
      case 'rating':     return p.sort((a,b) => b.labRating - a.labRating);
      default:           return p.sort((a,b) => a.labName.localeCompare(b.labName));
    }
  }

  get lowestPrice(): number {
    return this.prices.length ? Math.min(...this.prices.map(p => p.effectivePrice)) : 0;
  }

  getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).slice(0,2).join('');
  }

  bookNow(price: PriceDTO) {
    this.router.navigate(['/book'], { state: { price } });
  }

  // ─── Cart (delegates to CartService → localStorage) ───────────────────────

  get cart(): CartItem[] { return this.cartSvc.items; }
  get cartTotal(): number { return this.cartSvc.total; }
  get cartCount(): number { return this.cartSvc.count; }

  isInCart(priceId: number): boolean { return this.cartSvc.isInCart(priceId); }
  testHasCartItem(testId: number): boolean { return this.cartSvc.testHasCartItem(testId); }

  addToCart(price: PriceDTO) {
    this.cartSvc.add({ price, testName: this.selectedTestName });
  }

  removeFromCart(priceId: number) { this.cartSvc.remove(priceId); }
  clearCart() { this.cartSvc.clearAfterBooking(); }
  toggleCart() { this.showCart = !this.showCart; }

  proceedToBook() {
    if (this.cartSvc.count === 0) return;
    if (this.cartSvc.count === 1) {
      this.router.navigate(['/book'], { state: { price: this.cartSvc.items[0].price } });
    } else {
      this.router.navigate(['/book'], { state: { cartItems: this.cartSvc.items } });
    }
    this.showCart = false;
    // Cart is NOT cleared here — only cleared after successful booking (step 4)
  }
}
